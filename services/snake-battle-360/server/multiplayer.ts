import type { Server as HttpServer, IncomingMessage } from "http";
import { nanoid } from "nanoid";
import { WebSocketServer, type WebSocket } from "ws";

import {
  claimSnake,
  initializeArena,
  releaseClientSnakes,
  setSnakeStick,
  updateGame,
  type GameState,
  type Vec2,
} from "../shared/gameEngine.ts";
import {
  PROTOCOL_VERSION,
  safeJsonParse,
  type ClientToServerMessage,
  type PauseProposal,
  type PauseVote,
  type ServerToClientMessage,
} from "../shared/protocol.ts";

// -----------------------------------------------------------------------------
// Multiplayer goals (v5)
// - 每个房间固定最多 4 条蛇（真人 + AI 总数恒为 4）
// - 连接时通过 room/key/name 进入私密房间
// - 服务端 30Hz 权威模拟，20Hz 快照广播（每客户端定制：只发视野附近食物 + 压缩蛇身体点）
// - 暂停/继续需要房间内所有真人玩家投票
// -----------------------------------------------------------------------------

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

const MAX_PLAYERS = 4;
const SNAKE_COUNT = 4;

const TICK_MS = 33; // 约 30Hz
const SNAPSHOT_MS = 50; // 20Hz

const FOOD_VIEW_RADIUS = 1200;
const FOOD_MAX_PER_CLIENT = 240;

type Client = {
  id: string;
  ws: WebSocket;
  snakeId: string;
};

type PauseVoteState = {
  proposal: PauseProposal;
};

type Room = {
  id: string;
  key: string;
  state: GameState;
  clients: Map<string, Client>;
  clientName: Map<string, string>;
  nextPlayerNumber: number;
  pauseVoteState: PauseVoteState | null;
  timer: NodeJS.Timeout;
  lastBroadcastAt: number;
  lastEndedAt: number | null;
  lastTickAt: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function dist(a: Vec2, b: Vec2) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function send(ws: WebSocket, msg: ServerToClientMessage) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function parseRoomParams(req: IncomingMessage) {
  // req.url like: /ws?room=ABCD&key=123&name=Nick
  const u = new URL(req.url ?? "/ws", "http://localhost");
  const room = (u.searchParams.get("room") || "public").trim();
  const key = (u.searchParams.get("key") || "").trim();
  const name = (u.searchParams.get("name") || "").trim();

  const roomId = room.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "public";
  const roomKey = key.slice(0, 24);
  const playerName = (name || "").replace(/[\r\n\t]/g, "").slice(0, 16);

  return { roomId, roomKey, playerName };
}

// Compress a snake polyline for network / render. Keeps head & tail.
function compressBody<T extends { x: number; y: number }>(body: T[], maxPoints: number) {
  if (body.length <= maxPoints) return body;
  const stride = Math.max(1, Math.floor(body.length / maxPoints));
  const out: T[] = [];
  for (let i = 0; i < body.length; i += stride) out.push(body[i]);
  // ensure tail included
  const tail = body[body.length - 1];
  if (out[out.length - 1] !== tail) out.push(tail);
  return out;
}

function makeClientState(room: Room, client: Client): GameState {
  const state = room.state;

  const me = state.snakes.find((s) => s.id === client.snakeId);
  const head = me?.body?.[0] ?? { x: state.worldWidth / 2, y: state.worldHeight / 2 };

  // Filter food by view radius; cap count to avoid JSON blow-up.
  const visibleFood = state.food
    .filter((f) => dist(f.position, head) < FOOD_VIEW_RADIUS)
    .slice(0, FOOD_MAX_PER_CLIENT);

  const snakes = state.snakes.map((s) => {
    const maxPts = s.id === client.snakeId ? 220 : 140;
    return {
      ...s,
      body: compressBody(s.body, maxPts),
    };
  });

  // Keep rest of state fields
  return {
    ...state,
    snakes,
    food: visibleFood,
  };
}

export function setupMultiplayer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  const rooms = new Map<string, Room>();

  const ensureRoom = (roomId: string, key: string): Room => {
    let room = rooms.get(roomId);
    if (room) return room;

    const state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT);
    // 固定蛇池：期望数量 = 4
    state.desiredSnakeCount = SNAKE_COUNT;

    room = {
      id: roomId,
      key,
      state,
      clients: new Map(),
      clientName: new Map(),
      nextPlayerNumber: 1,
      pauseVoteState: null,
      timer: null as any,
      lastBroadcastAt: 0,
      lastEndedAt: null,
      lastTickAt: Date.now(),
    };

    // Room tick loop
    room.timer = setInterval(() => {
      const now = Date.now();

      // Pause vote resolution
      if (room.pauseVoteState) {
        maybeResolvePauseProposal(room);
        if (room.pauseVoteState) {
          broadcast(room, { type: "pause_proposal", proposal: room.pauseVoteState.proposal });
        }
      }

      // Auto restart after end
      if (!room.state.isRunning) {
        if (room.lastEndedAt === null) room.lastEndedAt = now;
        if (now - room.lastEndedAt > 2500) {
          // Re-init state
          room.state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT);
          room.state.desiredSnakeCount = SNAKE_COUNT;
          room.lastEndedAt = null;

          // Re-claim snakes for connected clients (keep stable seats)
          const freeSnakes = room.state.snakes.slice();
          for (const c of room.clients.values()) {
            const name = room.clientName.get(c.id) || `玩家${room.nextPlayerNumber++}`;
            const s = freeSnakes.shift();
            if (s) {
              claimSnake(room.state, s.id, c.id, name);
              c.snakeId = s.id;
            }
          }
          broadcast(room, { type: "info", message: "新一局开始！" });
        }
      }

      // Authoritative update
      const dt = clamp(now - room.lastTickAt, 1, 50);
      room.lastTickAt = now;
      if (room.state.isRunning && !room.state.isPaused) {
        updateGame(room.state, dt);
      } else {
        // keep time moving for animations
        room.state.gameTime += dt;
      }

      // Snapshot broadcast
      if (now - room.lastBroadcastAt >= SNAPSHOT_MS) {
        room.lastBroadcastAt = now;
        for (const c of room.clients.values()) {
          send(c.ws, { type: "state", state: makeClientState(room, c) });
        }
      }
    }, TICK_MS);

    rooms.set(roomId, room);
    return room;
  };

  const broadcast = (room: Room, msg: ServerToClientMessage) => {
    const payload = JSON.stringify(msg);
    for (const client of room.clients.values()) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload);
      }
    }
  };

  const getEligiblePlayers = (room: Room) => {
    const eligible = [];
    for (const c of room.clients.values()) {
      eligible.push({
        clientId: c.id,
        playerName: room.clientName.get(c.id) || "玩家",
      });
    }
    return eligible;
  };

  const maybeResolvePauseProposal = (room: Room) => {
    const vs = room.pauseVoteState;
    if (!vs) return;
    const p = vs.proposal;

    const now = Date.now();
    if (now > p.expiresAt) {
      room.pauseVoteState = null;
      broadcast(room, { type: "pause_result", requestId: p.requestId, action: p.action, accepted: false, reason: "投票超时" });
      return;
    }

    // shrink eligible if someone left
    const current = new Set(Array.from(room.clients.keys()));
    const nextEligible = p.eligible.filter((e) => current.has(e.clientId));
    if (nextEligible.length !== p.eligible.length) {
      p.eligible = nextEligible;
      const nextVotes: Record<string, PauseVote | null> = {};
      for (const e of nextEligible) nextVotes[e.clientId] = p.votes[e.clientId] ?? null;
      p.votes = nextVotes;
    }

    // reject immediately if any reject
    for (const cid of Object.keys(p.votes)) {
      if (p.votes[cid] === "reject") {
        room.pauseVoteState = null;
        broadcast(room, { type: "pause_result", requestId: p.requestId, action: p.action, accepted: false, reason: "有玩家拒绝" });
        return;
      }
    }

    const allAccepted = Object.keys(p.votes).length > 0 && Object.values(p.votes).every((v) => v === "accept");
    if (allAccepted) {
      room.state.isPaused = p.action === "pause";
      room.pauseVoteState = null;
      broadcast(room, { type: "pause_result", requestId: p.requestId, action: p.action, accepted: true });
      broadcast(room, { type: "info", message: p.action === "pause" ? "游戏已暂停" : "游戏已继续" });
      // broadcast a state immediately
      for (const c of room.clients.values()) {
        send(c.ws, { type: "state", state: makeClientState(room, c) });
      }
    }
  };

  wss.on("connection", (ws, req) => {
    const { roomId, roomKey, playerName } = parseRoomParams(req);
    const room = rooms.get(roomId) || ensureRoom(roomId, roomKey);

    // key check (private room)
    if ((room.key || "") !== (roomKey || "")) {
      send(ws, { type: "error", message: "房间密码错误" });
      ws.close();
      return;
    }

    if (room.clients.size >= MAX_PLAYERS) {
      send(ws, { type: "error", message: "房间已满（最多 4 人）" });
      ws.close();
      return;
    }

    const clientId = nanoid(10);

    // assign name
    const name = playerName || `玩家${room.nextPlayerNumber++}`;
    room.clientName.set(clientId, name);

    // claim an available snake (fixed pool of 4)
    const free = room.state.snakes.find((s) => s.isAlive && !s.controlledBy);
    if (!free) {
      send(ws, { type: "error", message: "没有可用的蛇位（请稍后重试）" });
      ws.close();
      return;
    }
    claimSnake(room.state, free.id, clientId, name);

    const client: Client = { id: clientId, ws, snakeId: free.id };
    room.clients.set(clientId, client);

    // welcome
    send(ws, {
      type: "welcome",
      version: PROTOCOL_VERSION,
      clientId,
      roomId: room.id,
      mySnakeId: client.snakeId,
      maxPlayers: MAX_PLAYERS,
      state: makeClientState(room, client),
    });
    broadcast(room, { type: "info", message: `${name} 加入房间（${room.clients.size}/${MAX_PLAYERS}）` });

    ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      const msg = safeJsonParse<ClientToServerMessage>(raw);
      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        return send(ws, { type: "error", message: "Bad message" });
      }

      switch (msg.type) {
        case "hello": {
          if (msg.version !== PROTOCOL_VERSION) {
            send(ws, {
              type: "error",
              message: `Protocol mismatch. Server=${PROTOCOL_VERSION}, Client=${msg.version}`,
            });
            ws.close();
          }
          return;
        }

        case "input": {
          setSnakeStick(room.state, client.snakeId, msg.stick);
          return;
        }

        case "restart": {
          // allow restart only when ended (or paused) to avoid griefing
          if (room.state.isRunning) return;
          room.state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT);
          room.state.desiredSnakeCount = SNAKE_COUNT;

          // re-claim
          const freeSnakes = room.state.snakes.slice();
          for (const c of room.clients.values()) {
            const n = room.clientName.get(c.id) || `玩家${room.nextPlayerNumber++}`;
            const s = freeSnakes.shift();
            if (s) {
              claimSnake(room.state, s.id, c.id, n);
              c.snakeId = s.id;
            }
          }
          broadcast(room, { type: "info", message: "已重开一局" });
          return;
        }

        case "pause_request": {
          if (!room.state.isRunning) return;
          if (room.pauseVoteState) {
            return send(ws, { type: "error", message: "当前已有暂停投票进行中" });
          }

          const eligible = getEligiblePlayers(room);
          if (eligible.length === 0) return;

          const requester = eligible.find((e) => e.clientId === clientId) || {
            clientId,
            playerName: name,
          };

          const requestId = nanoid(8);
          const votes: Record<string, PauseVote | null> = {};
          for (const e of eligible) votes[e.clientId] = null;

          room.pauseVoteState = {
            proposal: {
              requestId,
              action: msg.action,
              requestedBy: requester,
              eligible,
              votes,
              createdAt: Date.now(),
              expiresAt: Date.now() + 20000,
            },
          };

          broadcast(room, { type: "pause_proposal", proposal: room.pauseVoteState.proposal });
          return;
        }

        case "pause_vote": {
          const vs = room.pauseVoteState;
          if (!vs) return;
          if (vs.proposal.requestId !== msg.requestId) return;
          if (!(clientId in vs.proposal.votes)) return;

          vs.proposal.votes[clientId] = msg.vote;
          maybeResolvePauseProposal(room);
          return;
        }

        default:
          return;
      }
    });

    ws.on("close", () => {
      // release snake back to AI
      releaseClientSnakes(room.state, clientId);

      const nm = room.clientName.get(clientId) || "玩家";
      room.clients.delete(clientId);
      room.clientName.delete(clientId);

      broadcast(room, { type: "info", message: `${nm} 离开房间（${room.clients.size}/${MAX_PLAYERS}）` });

      // if everyone left, cleanup room to save CPU
      if (room.clients.size === 0) {
        clearInterval(room.timer);
        rooms.delete(room.id);
      } else {
        // if a pause proposal exists, re-evaluate eligibility
        if (room.pauseVoteState) {
          maybeResolvePauseProposal(room);
        }
      }
    });
  });
}
