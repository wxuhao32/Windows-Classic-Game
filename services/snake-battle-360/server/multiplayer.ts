import type { Server as HttpServer } from "http";
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
  type ServerToClientMessage,
  type PauseAction,
  type PauseProposal,
  type PauseVote,
} from "../shared/protocol.ts";

// Viewport (client canvas). The actual world is much larger and defined in shared/gameEngine.
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

// Online arena starts with a bunch of AI snakes. Players can claim any alive snake.
const SNAKE_COUNT = 12;

// Higher tick rate for smoother 360° movement (20Hz)
const TICK_MS = 50;
const ROOM_ID = "default";

type Client = {
  id: string;
  ws: WebSocket;
};

type PauseVoteState = {
  proposal: PauseProposal;
};

export function setupMultiplayer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  let state: GameState = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT);
  let lastEndedAt: number | null = null;
  let pauseVoteState: PauseVoteState | null = null;

  const clientName = new Map<string, string>();
  let nextPlayerNumber = 1;

  const clients = new Map<string, Client>();

  const broadcast = (msg: ServerToClientMessage) => {
    const payload = JSON.stringify(msg);
    for (const client of clients.values()) {
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(payload);
      }
    }
  };

  const send = (ws: WebSocket, msg: ServerToClientMessage) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(msg));
  };

  const getClientControlledSnakeId = (clientId: string): string | null => {
    const s = state.snakes.find((sn) => sn.controlledBy === clientId);
    return s ? s.id : null;
  };

  const getControlledPlayers = () => {
    return state.snakes
      .filter((s) => s.isAlive && s.isPlayer && s.controlledBy)
      .map((s) => ({
        clientId: s.controlledBy!,
        playerName: s.playerName || clientName.get(s.controlledBy!) || "玩家",
        snakeId: s.id,
      }))
      // 去重（一个客户端只控制一条蛇）
      .filter((p, idx, arr) => arr.findIndex((x) => x.clientId === p.clientId) === idx);
  };

  const broadcastPauseProposal = () => {
    if (!pauseVoteState) return;
    broadcast({ type: "pause_proposal", proposal: pauseVoteState.proposal });
  };

  const clearPauseProposal = (result: { accepted: boolean; reason?: string }) => {
    if (!pauseVoteState) return;
    const { requestId, action } = pauseVoteState.proposal;
    pauseVoteState = null;
    broadcast({ type: "pause_result", requestId, action, accepted: result.accepted, reason: result.reason });
  };

  const maybeResolvePauseProposal = () => {
    if (!pauseVoteState) return;
    const p = pauseVoteState.proposal;
    const now = Date.now();
    if (now > p.expiresAt) {
      clearPauseProposal({ accepted: false, reason: "投票超时" });
      return;
    }

    // 若参与者变化（断线/释放），动态收缩 eligible
    const current = getControlledPlayers();
    const currentIds = new Set(current.map((x) => x.clientId));
    const nextEligible = p.eligible.filter((x) => currentIds.has(x.clientId));
    if (nextEligible.length !== p.eligible.length) {
      p.eligible = nextEligible;
      const nextVotes: Record<string, PauseVote | null> = {};
      for (const e of nextEligible) {
        nextVotes[e.clientId] = p.votes[e.clientId] ?? null;
      }
      p.votes = nextVotes;
    }

    // 只要有人拒绝，立即失败
    for (const cid of Object.keys(p.votes)) {
      if (p.votes[cid] === "reject") {
        clearPauseProposal({ accepted: false, reason: "有玩家拒绝" });
        return;
      }
    }

    // 全部同意 => 生效
    const allAccepted = Object.keys(p.votes).length > 0 && Object.values(p.votes).every((v) => v === "accept");
    if (allAccepted) {
      state.isPaused = p.action === "pause";
      clearPauseProposal({ accepted: true });
      broadcast({ type: "state", state });
      broadcast({ type: "info", message: p.action === "pause" ? "游戏已暂停" : "游戏已继续" });
      return;
    }
  };

  // 权威 Tick：服务端推进状态，并广播
  const timer = setInterval(() => {
    // 若有暂停投票，检查是否到期/是否可以收敛
    if (pauseVoteState) {
      maybeResolvePauseProposal();
      // 仍未结束则同步提案（给晚到的状态/投票更新）
      if (pauseVoteState) {
        broadcastPauseProposal();
      }
    }

    if (!state.isRunning) {
      // 自动重开（3 秒后）
      if (lastEndedAt === null) lastEndedAt = Date.now();
      if (Date.now() - lastEndedAt > 3000) {
        state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT);
        lastEndedAt = null;
        broadcast({ type: "info", message: "新一局开始！" });
      }
    } else {
      updateGame(state, TICK_MS);
    }
    broadcast({ type: "state", state });
  }, TICK_MS);

  wss.on("connection", (ws) => {
    const clientId = nanoid();
    clients.set(clientId, { id: clientId, ws });

    // 初始欢迎包
    send(ws, {
      type: "welcome",
      version: PROTOCOL_VERSION,
      clientId,
      roomId: ROOM_ID,
      state,
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
            return send(ws, {
              type: "error",
              message: `Protocol mismatch. Server=${PROTOCOL_VERSION}, Client=${msg.version}`,
            });
          }
          return;
        }
        case "claim": {
          // 一个客户端只允许控制一条蛇；重新选择会把之前的蛇交还 AI
          releaseClientSnakes(state, clientId);
          const name = clientName.get(clientId) || `玩家${nextPlayerNumber++}`;
          clientName.set(clientId, name);
          const ok = claimSnake(state, msg.snakeId, clientId, name);
          if (!ok) {
            return send(ws, {
              type: "error",
              message: "该蛇已被占用或不存在（或已死亡）",
            });
          }
          broadcast({ type: "info", message: `${name} 接管了 ${msg.snakeId}` });
          broadcast({ type: "state", state });
          return;
        }
        case "input": {
          const snakeId = getClientControlledSnakeId(clientId);
          if (!snakeId) return;
          const stick = msg.stick as Vec2;
          setSnakeStick(state, snakeId, stick);
          return;
        }
        case "restart": {
          state = initializeArena(VIEW_WIDTH, VIEW_HEIGHT, SNAKE_COUNT);
          lastEndedAt = null;
          pauseVoteState = null;
          broadcast({ type: "info", message: "游戏已重开" });
          broadcast({ type: "state", state });
          return;
        }

        case "pause_request": {
          if (!state.isRunning) return;
          if (pauseVoteState) {
            return send(ws, { type: "error", message: "当前已有暂停投票进行中" });
          }

          const players = getControlledPlayers();
          if (players.length === 0) {
            return send(ws, { type: "error", message: "暂无真人玩家接管（请先接管一条蛇）" });
          }

          const requesterName = clientName.get(clientId) || "Player";
          const action: PauseAction = msg.action;

          // 若只有一个真人玩家，直接生效
          if (players.length === 1) {
            state.isPaused = action === "pause";
            broadcast({ type: "info", message: action === "pause" ? "游戏已暂停" : "游戏已继续" });
            broadcast({ type: "state", state });
            return;
          }

          const requestId = nanoid();
          const votes: Record<string, PauseVote | null> = {};
          for (const p of players) votes[p.clientId] = null;
          // 发起者默认同意
          votes[clientId] = "accept";

          pauseVoteState = {
            proposal: {
              requestId,
              action,
              requestedBy: clientId,
              requestedByName: requesterName,
              eligible: players.map((p) => ({
                clientId: p.clientId,
                playerName: p.playerName,
                snakeId: p.snakeId,
              })),
              votes,
              expiresAt: Date.now() + 15000,
            },
          };

          broadcastPauseProposal();
          return;
        }

        case "pause_vote": {
          if (!pauseVoteState) return;
          const p = pauseVoteState.proposal;
          if (msg.requestId !== p.requestId) return;
          if (!(clientId in p.votes)) return;
          p.votes[clientId] = msg.vote;
          maybeResolvePauseProposal();
          if (pauseVoteState) broadcastPauseProposal();
          return;
        }
      }
    });

    ws.on("close", () => {
      releaseClientSnakes(state, clientId);
      clients.delete(clientId);
      broadcast({ type: "info", message: "有玩家离开，已将其蛇交还 AI" });
      broadcast({ type: "state", state });
      // 若在投票中，尝试收敛
      if (pauseVoteState) {
        maybeResolvePauseProposal();
        if (pauseVoteState) broadcastPauseProposal();
      }
    });
  });

  wss.on("close", () => {
    clearInterval(timer);
  });

  return wss;
}
