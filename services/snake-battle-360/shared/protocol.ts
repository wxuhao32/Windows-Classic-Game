import type { GameState, Vec2 } from "./gameEngine";

export const PROTOCOL_VERSION = 5 as const;

export type Stick = Vec2;

export type PauseAction = "pause" | "resume";
export type PauseVote = "accept" | "reject";

export type PauseEligible = { clientId: string; playerName: string };

export type PauseProposal = {
  requestId: string;
  action: PauseAction;
  requestedBy: PauseEligible;
  eligible: PauseEligible[];
  votes: Record<string, PauseVote | null>;
  createdAt: number;
  expiresAt: number;
};

export type ClientToServerMessage =
  | { type: "hello"; version: typeof PROTOCOL_VERSION }
  | { type: "input"; stick: Stick }
  | { type: "restart" }
  | { type: "pause_request"; action: PauseAction }
  | { type: "pause_vote"; requestId: string; vote: PauseVote };

export type ServerToClientMessage =
  | { type: "welcome"; version: typeof PROTOCOL_VERSION; clientId: string; roomId: string; mySnakeId: string; maxPlayers: number; state: GameState }
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
