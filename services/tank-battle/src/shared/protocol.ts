import type { Direction, TileType, PowerUpType, TankType } from '../game/types';

export type RoomMode = 'pvp' | 'coop';

export type WSClientRole = 'host' | 'guest';

export interface InputVector {
  x: number;
  y: number;
}

export interface InputStateNet {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
  special: boolean;
  /** 输入序号（用于未来回滚/纠偏） */
  seq?: number;
  /** 预留：摇杆原始向量 */
  move?: { x: number; y: number };
  magnitude?: number;
}


export interface TankNet {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  type: TankType;
  isPlayer: boolean;
  health: number;
  activeBullets: number;
  isInvincible: boolean;
  invincibleTimer: number;
  fireLevel: number;
  moveCooldown: number;
  fireCooldown: number;
  onIce?: boolean;
  vx?: number;
  vy?: number;
}

export interface BulletNet {
  x: number;
  y: number;
  direction: Direction;
  speed: number;
  ownerId: string;
  canBreakSteel: boolean;
  active: boolean;
}

export interface ExplosionNet {
  x: number;
  y: number;
  frame: number;
  maxFrames: number;
  timer: number;
  active: boolean;
}

export interface PowerUpNet {
  x: number;
  y: number;
  type: PowerUpType;
  active: boolean;
  blinkTimer: number;
}

export interface EngineSnapshot {
  t: number;
  level: number;
  map: TileType[][];
  p1: TankNet | null;
  p2: TankNet | null;
  enemies: TankNet[];
  bullets: BulletNet[];
  explosions: ExplosionNet[];
  powerUps: PowerUpNet[];
  baseDestroyed: boolean;
  score: number;
}

// WS messages
export type ClientToServer =
  | { type: 'create'; roomId: string; password: string; nickname: string; mode: RoomMode }
  | { type: 'join'; roomId: string; password: string; nickname: string }
  | { type: 'leave' }
  | { type: 'input'; roomId: string; seq: number; input: InputStateNet }
  | { type: 'state'; roomId: string; tick: number; snapshot: EngineSnapshot }
  | { type: 'ping'; t: number };

export type ServerToClient =
  | { type: 'hello'; playerId: string }
  | { type: 'created'; roomId: string; playerId: string; seat: 1|2; role: 'host'; mode: RoomMode }
  | { type: 'joined'; roomId: string; playerId: string; seat: 1|2; role: 'guest'; hostId: string; mode: RoomMode }
  | { type: 'playerJoined'; roomId: string; playerId: string; seat: 1|2; nickname: string }
  | { type: 'playerLeft'; roomId: string; playerId: string }
  | { type: 'hostPromoted'; roomId: string; playerId: string }
  | { type: 'input'; roomId: string; playerId: string; seat: 1|2; seq: number; input: InputStateNet }
  | { type: 'state'; roomId: string; tick: number; snapshot: EngineSnapshot }
  | { type: 'error'; message: string }
  | { type: 'pong'; t: number }
  | { type: 'left' };
