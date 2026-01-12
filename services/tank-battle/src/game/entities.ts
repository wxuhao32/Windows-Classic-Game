// Game entities: Tank, Bullet, Explosion, PowerUp

import { Direction, TankType, TankStats, TANK_STATS, PowerUpType, Position, TILE_SIZE, COLORS } from './types';

export interface Bullet {
  x: number;
  y: number;
  direction: Direction;
  speed: number;
  ownerId: string;
  canBreakSteel: boolean;
  active: boolean;
}

export interface Explosion {
  x: number;
  y: number;
  frame: number;
  maxFrames: number;
  timer: number;
  active: boolean;
}

export interface PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  active: boolean;
  blinkTimer: number;
}

export class Tank {
  id: string;
  x: number;
  y: number;
  direction: Direction = Direction.UP;
  type: TankType;
  stats: TankStats;
  isPlayer: boolean;
  health: number;
  activeBullets: number = 0;
  isInvincible: boolean = false;
  invincibleTimer: number = 0;
  fireLevel: number = 0;
  moveCooldown: number = 0;
  fireCooldown: number = 0;
  onIce: boolean = false;
  velocity: { vx: number; vy: number } = { vx: 0, vy: 0 };

  constructor(id: string, x: number, y: number, type: TankType, isPlayer: boolean) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.type = type;
    this.stats = { ...TANK_STATS[type] };
    this.isPlayer = isPlayer;
    this.health = this.stats.health;
  }

  getColor(): string {
    if (this.isPlayer) return this.id === 'p2' ? COLORS.p2 : COLORS.p1;
    switch (this.type) {
      case TankType.LIGHT: return COLORS.enemyFast;
      case TankType.HEAVY: return COLORS.enemyHeavy;
      default: return COLORS.enemyBasic;
    }
  }

  canFire(): boolean {
    const maxBullets = this.stats.maxBullets + this.fireLevel;
    return this.activeBullets < maxBullets && this.fireCooldown <= 0;
  }

  takeDamage(): boolean {
    if (this.isInvincible) return false;
    this.health--;
    return this.health <= 0;
  }

  upgrade(): void {
    this.fireLevel = Math.min(this.fireLevel + 1, 3);
    if (this.fireLevel >= 2) {
      this.stats.canBreakSteel = true;
    }
  }

  setInvincible(duration: number): void {
    this.isInvincible = true;
    this.invincibleTimer = duration;
  }

  update(dt: number): void {
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) {
        this.isInvincible = false;
      }
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.moveCooldown > 0) this.moveCooldown -= dt;

    // Ice sliding physics
    if (this.onIce) {
      this.x += this.velocity.vx * dt * 60;
      this.y += this.velocity.vy * dt * 60;
      this.velocity.vx *= 0.98;
      this.velocity.vy *= 0.98;
    }
  }
}

export function createBullet(): Bullet {
  return { x: 0, y: 0, direction: Direction.UP, speed: 4, ownerId: '', canBreakSteel: false, active: false };
}

export function resetBullet(b: Bullet): void {
  b.active = false;
  b.x = 0;
  b.y = 0;
}

export function createExplosion(): Explosion {
  return { x: 0, y: 0, frame: 0, maxFrames: 3, timer: 0, active: false };
}

export function resetExplosion(e: Explosion): void {
  e.active = false;
  e.frame = 0;
  e.timer = 0;
}

export function createPowerUp(x: number, y: number, type: PowerUpType): PowerUp {
  return { x, y, type, active: true, blinkTimer: 0 };
}
