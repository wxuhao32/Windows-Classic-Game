import type { Server as HttpServer, IncomingMessage } from "http";
import { nanoid } from "nanoid";
import { WebSocketServer, type WebSocket } from "ws";

import {
  initializeArena,
  removeClientPlayers,
  setSnakeStick,
  spawnPlayerSnake,
  updateGame,
  type GameState,
  type Vec2,
} from "../shared/gameEngine.ts";
import {
  PROTOCOL_VERSION,
  safeJsonParse,
  type ClientToServerMessage,
  type ServerToClientMessage,
  type PauseAction,
  type PauseProposal,
  type PauseVote,
} from "../shared/protocol.ts";

// Viewport (client canvas). The actual world is much larger and defined in shared/gameEngine.
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

// Baseline AI count (players are additional)
const AI_SNAKE_COUNT = 12;

// Higher tick rate for smoother steering (≈30Hz)
const TICK_MS = 33;

// Broadcast rate (sending full state JSON is expensive). Keep simulation @30Hz but network @20Hz.
const BROADCAST_MS = 50;

type Client = {
  id: string;
  ws: WebSocket;
};

type PauseVoteState = {
  proposal: PauseProposal;
};

type Room = {
  id: string;
  key: string; // "" = no password (public)
  state: GameState;
  lastEndedAt: number | null;
  pauseVoteState: PauseVoteState | null;

  /** network throttling */
  lastBroadcastAt: number;

  clients: Map<string, Client>;
  clientName: Map<string, string>;
  nextPlayerNumber: number;
};

function normalizeRoomId(raw: string | null | undefined) {
  const r = (raw || "").trim();
  return r ? r.slice(0, 64) : "public";
}

function normalizeKey(raw: string | null | undefined) {
  return (raw || "").trim().slice(0, 64);
}

function normalizeName(raw: string | null | undefined) {
  const n = (raw || "").trim();
  return n ? n.slice(0, 24) : "";
}

function parseReqQuery(req: IncomingMessage) {
  const u = new URL(req.url || "/ws", "http://local");
  const p = u.searchParams;
  return {
    roomId: normalizeRoomId(p.get("room")),
    key: normalizeKey(p.get("key")),
    name: normalizeName(p.get("name")),
  };
}

export function setupMultiplayer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  const rooms = new Map<string, Room>();
  const pending = new Map<string, Client>(); // connected but not joined yet
  const clientRoom = new Map<string, string>(); // clientId -> roomId

  const getOrCreateRoom = (roomId: string, key: string): Room | null => {
    const id = normalizeRoomId(roomId);
    const k = normalizeKey(key);
    const existing = rooms.get(id);
    if (existing) {
      // password protected room must match
      if (existing.key && existing.key !== k) return null;
      // if room is public, ignore provided key (do not block)
      return existing;
    }

    // create new room (first joiner defines password)
    const room: Room = {
      id,
      key: k,
      state: initializeArena(VIEW_WIDTH, VIEW_HEIGHT, AI_SNAKE_COUNT),
      lastEndedAt: null,
      pauseVoteState: null,
      lastBroadcastAt: 0,
      clients: new Map(),
      clientName: new Map(),
      nextPlayerNumber: 1,
    };
    // desiredSnakeCount = ai + players (players add on join)
    room.state.desiredSnakeCount = AI_SNAKE_COUNT;
    rooms.set(id, room);
    return room;
  };

  const send = (ws: WebSocket, msg: ServerToClientMessage) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(msg));
  };

  const broadcast = (room: Room, msg: ServerToClientMessage) => {
    const payload = JSON.stringify(msg);
    for (const c of room.clients.values()) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(payload);
    }
  };

  /**
   * Compact the authoritative state for network transmission.
   * - Food particles contain several physics fields that are server-only. Dropping them reduces payload size a lot.
   * - This improves client smoothness (less JSON, less GC, less parse cost).
   */
  const compactStateForNet = (state: GameState): GameState => {
    return {
      ...state,
      food: state.food.map(
        (f) =>
          ({
            id: f.id,
            position: f.position,
            radius: f.radius,
            value: f.value,
            kind: f.kind,
            color: f.color,
          }) as any
      ),
    };
  };

  const maybeBroadcastState = (room: Room, force = false) => {
    const now = Date.now();
    if (!force && now - room.lastBroadcastAt < BROADCAST_MS) return;
    room.lastBroadcastAt = now;
    broadcast(room, { type: "state", state: compactStateForNet(room.state) });
  };

  const getClientControlledSnakeId = (room: Room, clientId: string): string | null => {
    const s = room.state.snakes.find((sn) => sn.controlledBy === clientId && sn.isAlive);
    return s ? s.id : null;
  };

  const getControlledPlayers = (room: Room) => {
    return room.state.snakes
      // ✅ 暂停投票应该覆盖“所有真人玩家”，包括暂时死亡但仍在房间里的玩家。
      .filter((s) => s.isPlayer && s.controlledBy)
      .map((s) => ({
        clientId: s.controlledBy!,
        playerName: s.playerName || room.clientName.get(s.controlledBy!) || "玩家",
        snakeId: s.id,
      }))
      // de-dup (one client controls one snake)
      .filter((p, idx, arr) => arr.findIndex((x) => x.clientId === p.clientId) === idx);
  };

  const broadcastPauseProposal = (room: Room) => {
    if (!room.pauseVoteState) return;
    broadcast(room, { type: "pause_proposal", proposal: room.pauseVoteState.proposal });
  };

  const clearPauseProposal = (room: Room, result: { accepted: boolean; reason?: string }) => {
    if (!room.pauseVoteState) return;
    const { requestId, action } = room.pauseVoteState.proposal;
    room.pauseVoteState = null;
    broadcast(room, { type: "pause_result", requestId, action, accepted: result.accepted, reason: result.reason });
  };

  const maybeResolvePauseProposal = (room: Room) => {
    if (!room.pauseVoteState) return;
    const p = room.pauseVoteState.proposal;
    const now = Date.now();
    if (now > p.expiresAt) {
      clearPauseProposal(room, { accepted: false, reason: "投票超时" });
      return;
    }

    // if participants changed (disconnect), shrink eligible
    const current = getControlledPlayers(room);
    const currentIds = new Set(current.map((x) => x.clientId));
    const nextEligible = p.eligible.filter((x) => currentIds.has(x.clientId));
    if (nextEligible.length !== p.eligible.length) {
      p.eligible = nextEligible;
      const nextVotes: Record<string, PauseVote | null> = {};
      for (const e of nextEligible) nextVotes[e.clientId] = p.votes[e.clientId] ?? null;
      p.votes = nextVotes;
    }

    // any reject => fail
    for (const cid of Object.keys(p.votes)) {
      if (p.votes[cid] === "reject") {
        clearPauseProposal(room, { accepted: false, reason: "有玩家拒绝" });
        return;
      }
    }

    // all accept => apply
    const allAccepted = Object.keys(p.votes).length > 0 && Object.values(p.votes).every((v) => v === "accept");
    if (allAccepted) {
      room.state.isPaused = p.action === "pause";
      clearPauseProposal(room, { accepted: true });
      // force immediate broadcast so all clients switch state right away
      maybeBroadcastState(room, true);
      broadcast(room, { type: "info", message: p.action === "pause" ? "游戏已暂停" : "游戏已继续" });
    }
  };

  // Authoritative tick for all rooms
  const timer = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.pauseVoteState) {
        maybeResolvePauseProposal(room);
        if (room.pauseVoteState) {
          // keep proposal UI fresh even if some clients join mid-vote
          broadcastPauseProposal(room);
        }
      }

      if (!room.state.isRunning) {
        if (room.lastEndedAt == null) room.lastEndedAt = Date.now();
        if (Date.now() - room.lastEndedAt > 3000) {
          room.state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, AI_SNAKE_COUNT);
          // ✅ 新一局：为房间内所有在线客户端重新生成“专属玩家蛇”
          for (const cid of room.clients.keys()) {
            const nm = room.clientName.get(cid) || "玩家";
            spawnPlayerSnake(room.state, cid, nm);
          }
          room.state.desiredSnakeCount = AI_SNAKE_COUNT + room.clients.size;
          room.lastEndedAt = null;
          room.pauseVoteState = null;
          broadcast(room, { type: "info", message: "新一局开始！" });
          maybeBroadcastState(room, true);
          continue;
        }
      } else {
        room.state.desiredSnakeCount = AI_SNAKE_COUNT + room.clients.size;
        updateGame(room.state, TICK_MS);
      }

      // ✅ throttle state broadcast to reduce stutter (JSON parse/GC)
      maybeBroadcastState(room);
    }
  }, TICK_MS);

  wss.on("connection", (ws, req) => {
    const clientId = nanoid();
    const client: Client = { id: clientId, ws };
    pending.set(clientId, client);

    const qs = parseReqQuery(req);

    const sendError = (message: string) => send(ws, { type: "error", message });

    const doJoin = (roomId: string, key: string, name: string) => {
      const room = getOrCreateRoom(roomId, key);
      if (!room) {
        sendError("房间号或密码错误（Key 不匹配）");
        return;
      }

      // move from pending to room
      pending.delete(clientId);
      clientRoom.set(clientId, room.id);
      room.clients.set(clientId, client);

      const playerName = normalizeName(name) || `玩家${room.nextPlayerNumber++}`;
      room.clientName.set(clientId, playerName);

      // create dedicated player snake
      const mySnakeId = spawnPlayerSnake(room.state, clientId, playerName);

      send(ws, {
        type: "welcome",
        version: PROTOCOL_VERSION,
        clientId,
        roomId: room.id,
        state: compactStateForNet(room.state),
        mySnakeId,
      });

      broadcast(room, { type: "info", message: `${playerName} 加入了房间 ${room.id}` });
      maybeBroadcastState(room, true);
    };

    ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      const msg = safeJsonParse<ClientToServerMessage>(raw);
      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        return sendError("Bad message");
      }

      // which room am I in?
      const rid = clientRoom.get(clientId);
      const room = rid ? rooms.get(rid) : null;

      switch (msg.type) {
        case "hello": {
          if (msg.version !== PROTOCOL_VERSION) {
            return sendError(`Protocol mismatch. Server=${PROTOCOL_VERSION}, Client=${msg.version}`);
          }
          // auto-join based on query (optional). Client may send join explicitly too.
          if (!rid) doJoin(qs.roomId, qs.key, qs.name);
          return;
        }

        case "join": {
          if (rid) return; // already joined
          doJoin(msg.roomId, normalizeKey(msg.key), normalizeName(msg.name));
          return;
        }

        case "input": {
          if (!room) return;
          const snakeId = getClientControlledSnakeId(room, clientId);
          if (!snakeId) return;
          const stick = msg.stick as Vec2;
          setSnakeStick(room.state, snakeId, stick);
          return;
        }

        case "restart": {
          if (!room) return;
          room.state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, AI_SNAKE_COUNT);
          // ✅ 重开：为所有当前在线客户端重新生成玩家蛇
          for (const cid of room.clients.keys()) {
            const nm = room.clientName.get(cid) || "玩家";
            spawnPlayerSnake(room.state, cid, nm);
          }
          room.state.desiredSnakeCount = AI_SNAKE_COUNT + room.clients.size;
          room.lastEndedAt = null;
          room.pauseVoteState = null;
          broadcast(room, { type: "info", message: "房间已重开" });
          maybeBroadcastState(room, true);
          return;
        }

        case "pause_request": {
          if (!room) return;
          if (!room.state.isRunning) return;
          if (room.pauseVoteState) return sendError("当前已有暂停投票进行中");

          const players = getControlledPlayers(room);
          if (players.length === 0) return sendError("暂无真人玩家");

          const requesterName = room.clientName.get(clientId) || "Player";
          const action: PauseAction = msg.action;

          // only one player => apply directly
          if (players.length === 1) {
            room.state.isPaused = action === "pause";
            broadcast(room, { type: "info", message: action === "pause" ? "游戏已暂停" : "游戏已继续" });
            maybeBroadcastState(room, true);
            return;
          }

          const requestId = nanoid();
          const votes: Record<string, PauseVote | null> = {};
          for (const p of players) votes[p.clientId] = null;
          votes[clientId] = "accept";

          room.pauseVoteState = {
            proposal: {
              requestId,
              action,
              requestedBy: clientId,
              requestedByName: requesterName,
              eligible: players,
              votes,
              expiresAt: Date.now() + 15000,
            },
          };

          broadcastPauseProposal(room);
          return;
        }

        case "pause_vote": {
          if (!room || !room.pauseVoteState) return;
          const p = room.pauseVoteState.proposal;
          if (msg.requestId !== p.requestId) return;
          if (!(clientId in p.votes)) return;
          p.votes[clientId] = msg.vote;
          maybeResolvePauseProposal(room);
          if (room.pauseVoteState) broadcastPauseProposal(room);
          return;
        }

        default:
          return;
      }
    });

    ws.on("close", () => {
      pending.delete(clientId);

      const rid = clientRoom.get(clientId);
      if (!rid) return;

      const room = rooms.get(rid);
      clientRoom.delete(clientId);
      if (!room) return;

      room.clients.delete(clientId);
      const name = room.clientName.get(clientId) || "玩家";
      room.clientName.delete(clientId);

      // remove player snake(s)
      removeClientPlayers(room.state, clientId);

      // clear pause proposal if needed (it will shrink / resolve in tick)
      broadcast(room, { type: "info", message: `${name} 离开了房间` });
      maybeBroadcastState(room, true);

      if (room.clients.size === 0) {
        rooms.delete(room.id);
      }
    });
  });

  // If server closes, stop timer
  wss.on("close", () => clearInterval(timer));
}
