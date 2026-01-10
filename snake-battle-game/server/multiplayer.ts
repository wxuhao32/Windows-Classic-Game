import type { IncomingMessage, Server as HttpServer } from "http";
import { nanoid } from "nanoid";
import { WebSocketServer, WebSocket } from "ws";

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
  type PauseAction,
  type PauseProposal,
  type PauseVote,
  type ServerToClientMessage,
} from "../shared/protocol.ts";

// Viewport (client canvas). The actual world is much larger and defined in shared/gameEngine.
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

// Online arena starts with a bunch of AI snakes. Players can claim any alive snake.
const SNAKE_COUNT = 12;

// Higher tick rate for smoother 360° movement (20Hz)
const TICK_MS = 50;

// Rooms that stay empty for a while will be GC'ed
const EMPTY_ROOM_GC_MS = 10 * 60 * 1000;

type Client = {
  id: string;
  ws: WebSocket;
  roomId: string;
};

type PauseVoteState = {
  proposal: PauseProposal;
};

type Room = {
  id: string;
  key: string; // empty => public
  state: GameState;
  lastEndedAt: number | null;
  pauseVoteState: PauseVoteState | null;

  clientName: Map<string, string>;
  nextPlayerNumber: number;

  clients: Map<string, Client>;
  emptySince: number | null;
};

function sanitizeRoomId(raw: string | null): string {
  const s = (raw || "").trim();
  if (!s) return "public";
  // allow a-zA-Z0-9_- up to 32 chars, otherwise fall back
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(s)) return "public";
  return s;
}

function safeHost(req: IncomingMessage): string {
  const h = req.headers.host || "localhost";
  return h;
}

function send(ws: WebSocket, msg: ServerToClientMessage) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

export function setupMultiplayer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  const rooms = new Map<string, Room>();

  const getOrCreateRoom = (roomId: string, key: string): Room | null => {
    const rid = sanitizeRoomId(roomId);
    const k = (key || "").trim();

    const existing = rooms.get(rid);
    if (existing) {
      // If room is locked, require exact key match
      if (existing.key && existing.key !== k) return null;
      // If room is public, allow any key (ignored)
      return existing;
    }

    const room: Room = {
      id: rid,
      key: k, // first joiner decides whether it is locked
      state: initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT),
      lastEndedAt: null,
      pauseVoteState: null,
      clientName: new Map(),
      nextPlayerNumber: 1,
      clients: new Map(),
      emptySince: null,
    };
    rooms.set(rid, room);
    return room;
  };

  const broadcastRoom = (room: Room, msg: ServerToClientMessage) => {
    for (const c of room.clients.values()) send(c.ws, msg);
  };

  const getControlledPlayers = (room: Room) => {
    const players = room.state.snakes
      .filter((s) => s.alive && s.controlledBy)
      .map((s) => ({
        clientId: s.controlledBy!,
        snakeId: s.id,
        playerName: s.playerName || room.clientName.get(s.controlledBy!) || "玩家",
      }));
    // unique by clientId (one snake each)
    const seen = new Set<string>();
    return players.filter((p) => (seen.has(p.clientId) ? false : (seen.add(p.clientId), true)));
  };

  const getClientControlledSnakeId = (room: Room, clientId: string): string | null => {
    const s = room.state.snakes.find((x) => x.alive && x.controlledBy === clientId);
    return s?.id || null;
  };

  const clearPauseProposal = (
    room: Room,
    result: { accepted: boolean; reason?: string } & { requestId: string; action: PauseAction }
  ) => {
    room.pauseVoteState = null;
    broadcastRoom(room, {
      type: "pause_result",
      requestId: result.requestId,
      action: result.action,
      accepted: result.accepted,
      reason: result.reason,
    });
  };

  const broadcastPauseProposal = (room: Room) => {
    if (!room.pauseVoteState) return;
    broadcastRoom(room, { type: "pause_proposal", proposal: room.pauseVoteState.proposal });
  };

  const maybeResolvePauseProposal = (room: Room) => {
    if (!room.pauseVoteState) return;
    const p = room.pauseVoteState.proposal;
    const now = Date.now();

    if (now > p.expiresAt) {
      clearPauseProposal(room, { requestId: p.requestId, action: p.action, accepted: false, reason: "投票超时" });
      return;
    }

    // shrink eligible if players left
    const current = getControlledPlayers(room);
    const currentIds = new Set(current.map((x) => x.clientId));
    const voteKeys = Object.keys(p.votes);
    for (const cid of voteKeys) {
      if (!currentIds.has(cid)) delete p.votes[cid];
    }

    // reject => fail
    for (const cid of Object.keys(p.votes)) {
      if (p.votes[cid] === "reject") {
        clearPauseProposal(room, { requestId: p.requestId, action: p.action, accepted: false, reason: "有玩家拒绝" });
        return;
      }
    }

    // all accept => apply
    const keys = Object.keys(p.votes);
    const allAccepted = keys.length > 0 && keys.every((cid) => p.votes[cid] === "accept");
    if (allAccepted) {
      room.state.isPaused = p.action === "pause";
      clearPauseProposal(room, { requestId: p.requestId, action: p.action, accepted: true });
      broadcastRoom(room, { type: "state", state: room.state });
      broadcastRoom(room, { type: "info", message: p.action === "pause" ? "游戏已暂停" : "游戏已继续" });
    } else {
      // keep broadcasting proposal as votes come in
    }
  };

  // Tick all rooms
  const timer = setInterval(() => {
    const now = Date.now();

    // GC empty rooms
    for (const [rid, room] of rooms.entries()) {
      if (room.clients.size === 0) {
        if (room.emptySince == null) room.emptySince = now;
        if (now - room.emptySince > EMPTY_ROOM_GC_MS) {
          rooms.delete(rid);
        }
        continue;
      } else {
        room.emptySince = null;
      }

      if (room.state.isPaused) {
        // paused — still allow auto-restart after end
      }

      if (!room.state.isRunning) {
        if (room.lastEndedAt == null) room.lastEndedAt = now;
        if (now - room.lastEndedAt > 2200) {
          room.state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT);
          room.lastEndedAt = null;
          room.pauseVoteState = null;
          broadcastRoom(room, { type: "info", message: "新一局开始！" });
        }
      } else {
        if (!room.state.isPaused) updateGame(room.state, TICK_MS);
      }

      // Pause proposal timeout / convergence
      if (room.pauseVoteState) {
        maybeResolvePauseProposal(room);
        if (room.pauseVoteState) broadcastPauseProposal(room);
      }

      broadcastRoom(room, { type: "state", state: room.state });
    }
  }, TICK_MS);

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "/ws", `http://${safeHost(req)}`);
    const roomId = sanitizeRoomId(url.searchParams.get("room"));
    const key = (url.searchParams.get("key") || "").trim();
    const desiredName = (url.searchParams.get("name") || "").trim();

    const room = getOrCreateRoom(roomId, key);
    if (!room) {
      send(ws, { type: "error", message: "房间密码错误（key 不匹配）" });
      ws.close();
      return;
    }

    const clientId = nanoid();
    const name = desiredName || `玩家${room.nextPlayerNumber++}`;

    const client: Client = { id: clientId, ws, roomId: room.id };
    room.clients.set(clientId, client);
    room.clientName.set(clientId, name);

    // 初始欢迎包
    send(ws, {
      type: "welcome",
      version: PROTOCOL_VERSION,
      clientId,
      roomId: room.id,
      state: room.state,
    });

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
            return;
          }
          return;
        }

        case "claim": {
          // claim a snake to control
          const already = getClientControlledSnakeId(room, clientId);
          if (already) {
            // release previous first
            releaseClientSnakes(room.state, clientId);
          }

          const ok = claimSnake(room.state, msg.snakeId, clientId, name);
          if (!ok) {
            send(ws, { type: "error", message: "该蛇已被占用或已死亡" });
            return;
          }
          broadcastRoom(room, { type: "info", message: `${name} 接管了 ${msg.snakeId}` });
          broadcastRoom(room, { type: "state", state: room.state });
          return;
        }

        case "input": {
          const snakeId = getClientControlledSnakeId(room, clientId);
          if (!snakeId) return;
          const stick = msg.stick as Vec2;
          setSnakeStick(room.state, snakeId, stick);
          return;
        }

        case "restart": {
          room.state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT);
          room.lastEndedAt = null;
          room.pauseVoteState = null;
          broadcastRoom(room, { type: "info", message: "游戏已重开" });
          broadcastRoom(room, { type: "state", state: room.state });
          return;
        }

        case "pause_request": {
          if (!room.state.isRunning) return;

          // If there is an active proposal, ignore duplicates
          if (room.pauseVoteState) {
            send(ws, { type: "info", message: "已有暂停投票在进行中" });
            return;
          }

          const action = msg.action as PauseAction;
          const players = getControlledPlayers(room);
          // Need at least 2 real players to require consent; otherwise toggle directly
          if (players.length <= 1) {
            room.state.isPaused = action === "pause";
            broadcastRoom(room, { type: "state", state: room.state });
            broadcastRoom(room, { type: "info", message: action === "pause" ? "游戏已暂停" : "游戏已继续" });
            return;
          }

          const requestId = nanoid();
          const votes: Record<string, PauseVote | null> = {};
          for (const p of players) votes[p.clientId] = null;

          room.pauseVoteState = {
            proposal: {
              requestId,
              action,
              requestedBy: clientId,
              requestedByName: name,
              eligible: players.map((p) => ({
                clientId: p.clientId,
                playerName: p.playerName,
                snakeId: p.snakeId,
              })),
              votes,
              expiresAt: Date.now() + 15000,
            },
          };

          broadcastPauseProposal(room);
          return;
        }

        case "pause_vote": {
          if (!room.pauseVoteState) return;
          const p = room.pauseVoteState.proposal;
          if (msg.requestId !== p.requestId) return;
          if (!(clientId in p.votes)) return;
          p.votes[clientId] = msg.vote;
          maybeResolvePauseProposal(room);
          if (room.pauseVoteState) broadcastPauseProposal(room);
          return;
        }
      }
    });

    ws.on("close", () => {
      // Release snakes controlled by this client
      releaseClientSnakes(room.state, clientId);
      room.clients.delete(clientId);
      room.clientName.delete(clientId);

      broadcastRoom(room, { type: "info", message: `${name} 已离开房间` });
      broadcastRoom(room, { type: "state", state: room.state });

      // If in vote, attempt to converge
      if (room.pauseVoteState) {
        maybeResolvePauseProposal(room);
        if (room.pauseVoteState) broadcastPauseProposal(room);
      }
    });
  });

  wss.on("close", () => {
    clearInterval(timer);
  });

  return wss;
}
