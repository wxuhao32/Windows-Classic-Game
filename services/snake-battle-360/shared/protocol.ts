import type { GameState, Vec2 } from "./gameEngine";

export const PROTOCOL_VERSION = 5 as const;

export type Stick = Vec2;

export type ClientToServerMessage =
  | { type: "hello"; version: typeof PROTOCOL_VERSION }
  | { type: "join"; roomId: string; key?: string; name?: string }
  | { type: "input"; stick: Stick }
  | { type: "restart" }
  | { type: "pause_request"; action: PauseAction }
  | { type: "pause_vote"; requestId: string; vote: PauseVote };

export type PauseAction = "pause" | "resume";
export type PauseVote = "accept" | "reject";

export type PauseProposal = {
  requestId: string;
  action: PauseAction;
  requestedBy: string;
  requestedByName: string;
  eligible: Array<{ clientId: string; playerName: string; snakeId: string | null }>;
  votes: Record<string, PauseVote | null>;
  expiresAt: number;
};

export type ServerToClientMessage =
  | {
      type: "welcome";
      version: typeof PROTOCOL_VERSION;
      clientId: string;
      roomId: string;
      /** server-side authoritative state */
      state: GameState;
      /** convenience: which snake is controlled by this client (if any) */
      mySnakeId: string | null;
    }
  | { type: "state"; state: GameState }
  | { type: "info"; message: string }
  | { type: "error"; message: string }
  | { type: "pause_proposal"; proposal: PauseProposal }
  | { type: "pause_result"; requestId: string; action: PauseAction; accepted: boolean; reason?: string };

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
