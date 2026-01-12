// Core game types

export const TILE_SIZE = 16;
export const MAP_WIDTH = 26;
export const MAP_HEIGHT = 26;
export const CANVAS_WIDTH = MAP_WIDTH * TILE_SIZE;
export const CANVAS_HEIGHT = MAP_HEIGHT * TILE_SIZE;

export enum TileType {
  EMPTY = 0,
  BRICK = 1,
  STEEL = 2,
  WATER = 3,
  FOREST = 4,
  ICE = 5,
  BASE = 6,
  BASE_DESTROYED = 7,
}

export enum TankType {
  NORMAL = 'normal',
  LIGHT = 'light',
  HEAVY = 'heavy',
  RAPID = 'rapid',
}

export enum Direction {
  UP = 0,
  RIGHT = 1,
  DOWN = 2,
  LEFT = 3,
}

export enum PowerUpType {
  HELMET = 'helmet',
  CLOCK = 'clock',
  BOMB = 'bomb',
  STAR = 'star',
  SHOVEL = 'shovel',
}

export interface Position {
  x: number;
  y: number;
}

export interface TankStats {
  speed: number;
  bulletSpeed: number;
  maxBullets: number;
  health: number;
  canBreakSteel: boolean;
}

export const TANK_STATS: Record<TankType, TankStats> = {
  [TankType.NORMAL]: { speed: 1.5, bulletSpeed: 4, maxBullets: 1, health: 1, canBreakSteel: false },
  [TankType.LIGHT]: { speed: 2.5, bulletSpeed: 5, maxBullets: 1, health: 1, canBreakSteel: false },
  [TankType.HEAVY]: { speed: 1, bulletSpeed: 3, maxBullets: 1, health: 3, canBreakSteel: true },
  [TankType.RAPID]: { speed: 1.5, bulletSpeed: 5, maxBullets: 3, health: 1, canBreakSteel: false },
};

export interface GameState {
  scene: 'menu' | 'game' | 'pause' | 'gameover' | 'levelcomplete';
  level: number;
  score: number;
  lives: number;
  isPaused: boolean;
}

export const COLORS = {
  bg: '#000000',
  p1: '#B5E61D',
  p2: '#F1C40F',
  enemyBasic: '#FFFFFF',
  enemyFast: '#E74C3C',
  enemyHeavy: '#D35400',
  brick: '#D35400',
  steel: '#95A5A6',
  water: '#3498DB',
  forest: '#2ECC71',
  ice: '#ECF0F1',
  base: '#FFFF00',
};
