// Core Game Engine - State management and game logic

import { Direction, TileType, TankType, PowerUpType, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, COLORS } from './types';
import type { InputState } from './input';
import type { EngineSnapshot, TankNet, BulletNet, ExplosionNet, PowerUpNet } from '../shared/protocol';
import { Tank, Bullet, Explosion, PowerUp, createBullet, resetBullet, createExplosion, resetExplosion, createPowerUp } from './entities';
import { ObjectPool } from './ObjectPool';
import { findPath } from './AStar';
import { LEVELS, LEVEL_ENEMIES, getPlayerSpawn, EnemySpawn } from './levels';

export type GameScene = 'menu' | 'game' | 'pause' | 'gameover' | 'levelcomplete';

export interface GameEngineState {
  scene: GameScene;
  level: number;
  score: number;
  lives: number;
  hiScore: number;
  enemiesRemaining: number;
  baseDestroyed: boolean;
}

export class GameEngine {
  // Camera shake state (renderer reads x/y offset)
  public cameraShake = {
    x: 0,
    y: 0,
    timeLeftMs: 0,
    totalMs: 0,
    intensityPx: 0,
    phase: 0,
    seed: 1337,
  };

  private _input: InputState = { move: {x:0,y:0}, magnitude: 0, fire: false, special: false, seq: 0 };

  setInputState(input: Readonly<InputState>): void {
    // copy fields to avoid replacing object (GC)
    this._input.move.x = input.move.x;
    this._input.move.y = input.move.y;
    this._input.magnitude = input.magnitude;
    this._input.fire = input.fire;
    this._input.special = input.special;
    this._input.seq = input.seq;
  }

  step(dtSec: number, input?: Readonly<InputState>): void {
    if (input) this.setInputState(input);
    // Bridge to existing update(dt) tick
    this.update(dtSec);
  }

  addCameraShake(intensityPx: number, durationMs: number): void {
    this.cameraShake.intensityPx = intensityPx;
    this.cameraShake.totalMs = durationMs;
    this.cameraShake.timeLeftMs = durationMs;
    this.cameraShake.phase = (this.cameraShake.phase + 0.7) % (Math.PI * 2);
  }

  private updateCameraShake(dtMs: number): void {
    const cs = this.cameraShake;
    if (cs.timeLeftMs <= 0) { cs.x = cs.y = 0; return; }
    cs.timeLeftMs = Math.max(0, cs.timeLeftMs - dtMs);
    const t = 1 - (cs.timeLeftMs / cs.totalMs);
    const falloff = 1 - t; // linear falloff; simple and stable
    cs.phase += 0.25;
    cs.x = Math.sin(cs.phase * 1.2) * cs.intensityPx * falloff;
    cs.y = Math.cos(cs.phase * 0.9) * cs.intensityPx * falloff;
    if (cs.timeLeftMs === 0) { cs.x = cs.y = 0; }
  }

  // State
  state: GameEngineState = {
    scene: 'menu',
    level: 0,
    score: 0,
    lives: 3,
    hiScore: 20000,
    enemiesRemaining: 0,
    baseDestroyed: false,
  };

  // Map
  map: TileType[][] = [];

  // Entities
  player: Tank | null = null;
  enemies: Tank[] = [];
  powerUps: PowerUp[] = [];

  // Object pools
  bulletPool: ObjectPool<Bullet>;
  explosionPool: ObjectPool<Explosion>;

  // Enemy spawning
  private enemySpawns: EnemySpawn[] = [];
  private spawnTimer: number = 0;
  private spawnIndex: number = 0;
  private maxActiveEnemies: number = 4;

  // AI update throttle
  private aiTimer: number = 0;

  // Input state
  inputState = {
    up: false, down: false, left: false, right: false,
    fire: false, special: false,
  };

  // Multiplayer (2P) support
  public multiplayerEnabled: boolean = false;
  public multiplayerMode: 'pvp' | 'coop' = 'pvp';
  public remotePlayer: Tank | null = null;
  private remoteInputState = {
    up: false, down: false, left: false, right: false,
    fire: false, special: false,
  };


  // Frozen enemies timer
  private frozenTimer: number = 0;

  // Base fortified timer
  private fortifiedTimer: number = 0;
  private originalBaseTiles: { x: number; y: number; tile: TileType }[] = [];

  constructor() {
    this.bulletPool = new ObjectPool(createBullet, resetBullet, 50);
    this.explosionPool = new ObjectPool(createExplosion, resetExplosion, 30);
  }

  startGame(level: number = 0): void {
    this.state.scene = 'game';
    this.state.level = level;
    this.state.baseDestroyed = false;
    this.loadLevel(level);
  }
/** 开启/关闭 2 人联机模式（只改变关卡加载/碰撞逻辑，不绑定具体网络实现） */
setMultiplayerEnabled(enabled: boolean): void {
  this.multiplayerEnabled = enabled;
}

/** 给 2P 设置输入（由网络层或本地设备提供） */
setRemoteInput(key: 'up'|'down'|'left'|'right'|'fire'|'special', pressed: boolean): void {
  (this.remoteInputState as any)[key] = pressed;
}



  loadLevel(levelIndex: number): void {
    const levelData = LEVELS[levelIndex % LEVELS.length];
    this.map = levelData.map(row => [...row]);

    // Spawn player(s)
const spawn = getPlayerSpawn();
this.player = new Tank('p1', spawn.x, spawn.y, TankType.NORMAL, true);
this.player.setInvincible(3000);

if (this.multiplayerEnabled && this.multiplayerMode === 'pvp') {
  // 2P 出生点（尽量对称，避免重叠）
  this.remotePlayer = new Tank('p2', 18, 24, TankType.NORMAL, true);
  this.remotePlayer.setInvincible(3000);

  // 联机对战默认不刷 AI 敌人（先保证可玩与稳定）
  this.enemies.length = 0;
  this.enemySpawn.length = 0;
  this.state.enemiesRemaining = 0;
} else {
  this.remotePlayer = null;
}

    // Setup enemy spawns
    this.enemySpawns = [...LEVEL_ENEMIES[levelIndex % LEVEL_ENEMIES.length]];
    this.state.enemiesRemaining = this.enemySpawns.length;
    this.spawnTimer = 0;
    this.spawnIndex = 0;
    this.enemies = [];

    // Clear pools
    this.bulletPool.releaseAll();
    this.explosionPool.releaseAll();
    this.powerUps = [];
    this.frozenTimer = 0;
    this.fortifiedTimer = 0;
  }

  update(dt: number): void {
    if (this.state.scene !== 'game') return;

    // Update timers
    this.spawnTimer += dt * 1000;
    this.aiTimer += dt;

    // Update fortified timer
    if (this.fortifiedTimer > 0) {
      this.fortifiedTimer -= dt * 1000;
      if (this.fortifiedTimer <= 0) {
        this.revertBaseFortification();
      }
    }

    // Spawn enemies
    if (!this.multiplayerEnabled || this.multiplayerMode === 'coop') {
      this.updateEnemySpawns();
    }

    // Update player
    if (this.player) {
      this.updatePlayerInput(dt);
      this.player.update(dt);
    }

// Update 2P（联机）
if (this.multiplayerEnabled && this.remotePlayer) {
  this.updateRemotePlayerInput(dt);
  this.remotePlayer.update(dt);
}

    // Update enemies
    if (this.frozenTimer > 0) {
      this.frozenTimer -= dt * 1000;
    } else {
      for (const enemy of this.enemies) {
        enemy.update(dt);
        if (this.aiTimer > 0.1) {
          this.updateAI(enemy);
        }
      }
      if (this.aiTimer > 0.1) this.aiTimer = 0;
    }

    // Update bullets
    this.updateBullets(dt);

    // Update explosions
    this.updateExplosionsMs(dt * 1000);

    // Update power-ups
    this.updatePowerUpsMs(dt * 1000);

    // Check win/lose conditions
    this.checkGameConditions();

    // camera shake
    this.updateCameraShake(dt * 1000);
  }

  private updateEnemySpawns(): void {
    if (this.spawnIndex >= this.enemySpawns.length) return;
    if (this.enemies.length >= this.maxActiveEnemies) return;

    const spawn = this.enemySpawns[this.spawnIndex];
    if (this.spawnTimer >= spawn.delay) {
      const typeMap: Record<string, TankType> = {
        normal: TankType.NORMAL,
        light: TankType.LIGHT,
        heavy: TankType.HEAVY,
        rapid: TankType.RAPID,
      };
      const enemy = new Tank(`enemy_${this.spawnIndex}`, spawn.x, spawn.y, typeMap[spawn.type], false);
      enemy.direction = Direction.DOWN;
      this.enemies.push(enemy);
      this.spawnIndex++;
    }
  }

  private updatePlayerInput(dt: number): void {
    if (!this.player) return;

    let dx = 0, dy = 0;
    let newDir: Direction | null = null;

    if (this.inputState.up) { dy = -1; newDir = Direction.UP; }
    else if (this.inputState.down) { dy = 1; newDir = Direction.DOWN; }
    else if (this.inputState.left) { dx = -1; newDir = Direction.LEFT; }
    else if (this.inputState.right) { dx = 1; newDir = Direction.RIGHT; }

    if (newDir !== null) {
      this.player.direction = newDir;
    }

    if (dx !== 0 || dy !== 0) {
      const speed = this.player.stats.speed * dt * 60;
      const newX = this.player.x + dx * speed;
      const newY = this.player.y + dy * speed;

      // Check collision with bounds and tiles
      if (this.canMoveTo(newX, newY, 2)) {
        this.player.x = newX;
        this.player.y = newY;

        // Check ice
        const tileX = Math.floor((this.player.x + 1) / 1);
        const tileY = Math.floor((this.player.y + 1) / 1);
        this.player.onIce = this.getTile(tileX, tileY) === TileType.ICE;
        if (this.player.onIce) {
          this.player.velocity.vx = dx * speed * 0.3;
          this.player.velocity.vy = dy * speed * 0.3;
        }
      }
    }

    if (this.inputState.fire && this.player.canFire()) {
      this.fireBullet(this.player);
    }
  }

  private updateAI(enemy: Tank): void {
    if (!this.player) return;

    // Simple AI: move towards player or base, shoot when aligned
    const path = findPath(this.map, Math.floor(enemy.x), Math.floor(enemy.y),
      Math.floor(this.player.x), Math.floor(this.player.y));

    if (path && path.length > 1) {
      const next = path[1];
      const dx = next.x - Math.floor(enemy.x);
      const dy = next.y - Math.floor(enemy.y);

      if (Math.abs(dx) > Math.abs(dy)) {
        enemy.direction = dx > 0 ? Direction.RIGHT : Direction.LEFT;
      } else {
        enemy.direction = dy > 0 ? Direction.DOWN : Direction.UP;
      }

      const speed = enemy.stats.speed * 0.016 * 60;
      const newX = enemy.x + (dx !== 0 ? Math.sign(dx) * speed : 0);
      const newY = enemy.y + (dy !== 0 ? Math.sign(dy) * speed : 0);

      if (this.canMoveTo(newX, newY, 2)) {
        if (dx !== 0) enemy.x = newX;
        else enemy.y = newY;
      }
    } else {
      // Random movement
      if (Math.random() < 0.02) {
        enemy.direction = Math.floor(Math.random() * 4) as Direction;
      }
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [dx, dy] = dirs[enemy.direction];
      const speed = enemy.stats.speed * 0.016 * 60;
      const newX = enemy.x + dx * speed;
      const newY = enemy.y + dy * speed;
      if (this.canMoveTo(newX, newY, 2)) {
        enemy.x = newX;
        enemy.y = newY;
      } else {
        enemy.direction = Math.floor(Math.random() * 4) as Direction;
      }
    }

    // Shoot logic
    if (Math.random() < 0.03 && enemy.canFire()) {
      this.fireBullet(enemy);
    }
  }

  private canMoveTo(x: number, y: number, size: number): boolean {
    if (x < 0 || y < 0 || x + size > MAP_WIDTH || y + size > MAP_HEIGHT) return false;

    const tiles = [
      { tx: Math.floor(x), ty: Math.floor(y) },
      { tx: Math.floor(x + size - 0.1), ty: Math.floor(y) },
      { tx: Math.floor(x), ty: Math.floor(y + size - 0.1) },
      { tx: Math.floor(x + size - 0.1), ty: Math.floor(y + size - 0.1) },
    ];

    for (const { tx, ty } of tiles) {
      const tile = this.getTile(tx, ty);
      if (tile === TileType.BRICK || tile === TileType.STEEL ||
          tile === TileType.WATER || tile === TileType.BASE) {
        return false;
      }
    }
    return true;
  }

  private getTile(x: number, y: number): TileType {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return TileType.STEEL;
    return this.map[y]?.[x] ?? TileType.EMPTY;
  }

  private setTile(x: number, y: number, tile: TileType): void {
    if (x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT) {
      this.map[y][x] = tile;
    }
  }

  fireBullet(tank: Tank): void {
    const bullet = this.bulletPool.acquire();
    bullet.active = true;
    bullet.ownerId = tank.id;
    bullet.direction = tank.direction;
    bullet.speed = tank.stats.bulletSpeed + tank.fireLevel;
    bullet.canBreakSteel = tank.stats.canBreakSteel;

    // Position bullet at tank front
    const offsets = [
      { x: 0.75, y: -0.5 },  // UP
      { x: 2, y: 0.75 },     // RIGHT
      { x: 0.75, y: 2 },     // DOWN
      { x: -0.5, y: 0.75 },  // LEFT
    ];
    const off = offsets[tank.direction];
    bullet.x = tank.x + off.x;
    bullet.y = tank.y + off.y;

    tank.activeBullets++;
    tank.fireCooldown = 300;
  }

  private updateBullets(dt: number): void {
    const bullets = this.bulletPool.getActive();
    const toRelease: Bullet[] = [];

    for (const bullet of bullets) {
      if (!bullet.active) continue;

      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [dx, dy] = dirs[bullet.direction];
      bullet.x += dx * bullet.speed * dt * 60;
      bullet.y += dy * bullet.speed * dt * 60;

      // Check bounds
      if (bullet.x < 0 || bullet.y < 0 || bullet.x >= MAP_WIDTH || bullet.y >= MAP_HEIGHT) {
        this.createExplosion(bullet.x, bullet.y, true);
        this.reduceBulletCount(bullet.ownerId);
        toRelease.push(bullet);
        continue;
      }

      // Check tile collision
      const tx = Math.floor(bullet.x);
      const ty = Math.floor(bullet.y);
      const tile = this.getTile(tx, ty);

      if (tile === TileType.BRICK) {
        this.setTile(tx, ty, TileType.EMPTY);
        this.createExplosion(bullet.x * TILE_SIZE, bullet.y * TILE_SIZE, true);
        this.reduceBulletCount(bullet.ownerId);
        toRelease.push(bullet);
        continue;
      }

      if (tile === TileType.STEEL) {
        if (bullet.canBreakSteel) {
          this.setTile(tx, ty, TileType.EMPTY);
        }
        this.createExplosion(bullet.x * TILE_SIZE, bullet.y * TILE_SIZE, true);
        this.reduceBulletCount(bullet.ownerId);
        toRelease.push(bullet);
        continue;
      }

      if (tile === TileType.BASE || tile === TileType.BASE_DESTROYED) {
        this.setTile(tx, ty, TileType.BASE_DESTROYED);
        this.state.baseDestroyed = true;
        this.createExplosion(bullet.x * TILE_SIZE, bullet.y * TILE_SIZE, false);
        this.reduceBulletCount(bullet.ownerId);
        toRelease.push(bullet);
        continue;
      }

      // Check tank collision
      const hitTank = this.checkBulletTankCollision(bullet);
      if (hitTank) {
        toRelease.push(bullet);
      }
    }

    for (const b of toRelease) {
      this.bulletPool.release(b);
    }
  }

  private checkBulletTankCollision(bullet: Bullet): boolean {
const isP1 = bullet.ownerId === 'p1';
const isP2 = bullet.ownerId === 'p2';

// 联机对战（PVP）：P1/P2 互相命中
if (this.multiplayerEnabled) {
  if (isP1 && this.remotePlayer && this.bulletHitsTank(bullet, this.remotePlayer)) {
    if (!this.remotePlayer.isInvincible) {
      const destroyed = this.remotePlayer.takeDamage();
      if (destroyed) {
        this.createExplosion(this.remotePlayer.x * TILE_SIZE, this.remotePlayer.y * TILE_SIZE, false);
        this.state.scene = 'gameover';
      }
    }
    this.reduceBulletCount(bullet.ownerId);
    return true;
  }
  if (isP2 && this.player && this.bulletHitsTank(bullet, this.player)) {
    if (!this.player.isInvincible) {
      const destroyed = this.player.takeDamage();
      if (destroyed) {
        this.createExplosion(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, false);
        this.state.scene = 'gameover';
      }
    }
    this.reduceBulletCount(bullet.ownerId);
    return true;
  }
}

// Player bullet hits enemies (单机/联机均可)
if (isP1 || isP2) {

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const enemy = this.enemies[i];
        if (this.bulletHitsTank(bullet, enemy)) {
          const destroyed = enemy.takeDamage();
          if (destroyed) {
            this.enemies.splice(i, 1);
            this.state.enemiesRemaining--;
            this.state.score += 100;
            this.createExplosion(enemy.x * TILE_SIZE, enemy.y * TILE_SIZE, false);
            this.maybeSpawnPowerUp(enemy.x, enemy.y);
          } else {
            this.createExplosion(bullet.x * TILE_SIZE, bullet.y * TILE_SIZE, true);
          }
          this.reduceBulletCount(bullet.ownerId);
          return true;
        }
      }
    } else {
      // Enemy bullet hits player（AI 子弹）
      if (this.player && this.bulletHitsTank(bullet, this.player)) {
        if (!this.player.isInvincible) {
          const destroyed = this.player.takeDamage();
          if (destroyed) {
            this.state.lives--;
            this.createExplosion(this.player.x * TILE_SIZE, this.player.y * TILE_SIZE, false);
            if (this.state.lives > 0) {
              this.respawnPlayer();
            }
          }
        }
        this.reduceBulletCount(bullet.ownerId);
        return true;
      }
    }

    return false;
  }

  private bulletHitsTank(bullet: Bullet, tank: Tank): boolean {
    const bx = bullet.x;
    const by = bullet.y;
    return bx >= tank.x && bx <= tank.x + 2 && by >= tank.y && by <= tank.y + 2;
  }

  private reduceBulletCount(ownerId: string): void {
    if (ownerId === 'p1' && this.player) {
      this.player.activeBullets = Math.max(0, this.player.activeBullets - 1);
    } else if (ownerId === 'p2' && this.remotePlayer) {
      this.remotePlayer.activeBullets = Math.max(0, this.remotePlayer.activeBullets - 1);
    } else {
      const enemy = this.enemies.find(e => e.id === ownerId);
      if (enemy) enemy.activeBullets = Math.max(0, enemy.activeBullets - 1);
    }
  }

  private createExplosion(x: number, y: number, small: boolean): void {
    const exp = this.explosionPool.acquire();
    exp.active = true;
    exp.x = x;
    exp.y = y;
    exp.frame = 0;
    exp.maxFrames = small ? 2 : 3;
    exp.timer = 0;
  }

  private updateExplosions(dt: number): void {
    const explosions = this.explosionPool.getActive();
    const toRelease: Explosion[] = [];

    for (const exp of explosions) {
      if (!exp.active) continue;
      exp.timer += dt * 1000;
      if (exp.timer > 100) {
        exp.timer = 0;
        exp.frame++;
        if (exp.frame >= exp.maxFrames) {
          toRelease.push(exp);
        }
      }
    }

    for (const e of toRelease) {
      this.explosionPool.release(e);
    }
  }

  private maybeSpawnPowerUp(x: number, y: number): void {
    if (Math.random() < 0.2) {
      const types = [PowerUpType.HELMET, PowerUpType.CLOCK, PowerUpType.BOMB, PowerUpType.STAR, PowerUpType.SHOVEL];
      const type = types[Math.floor(Math.random() * types.length)];
      this.powerUps.push(createPowerUp(x, y, type));
    }
  }

  private updatePowerUps(dt: number): void {
    if (!this.player) return;

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.blinkTimer += dt * 1000;

      // Check player collision
      const px = this.player.x, py = this.player.y;
      if (px < pu.x + 2 && px + 2 > pu.x && py < pu.y + 2 && py + 2 > pu.y) {
        this.applyPowerUp(pu.type);
        this.powerUps.splice(i, 1);
        this.state.score += 500;
      }
    }
  }

  private applyPowerUp(type: PowerUpType): void {
    if (!this.player) return;

    switch (type) {
      case PowerUpType.HELMET:
        this.player.setInvincible(10000);
        break;
      case PowerUpType.CLOCK:
        this.frozenTimer = 10000;
        break;
      case PowerUpType.BOMB:
        for (const enemy of this.enemies) {
          this.createExplosion(enemy.x * TILE_SIZE, enemy.y * TILE_SIZE, false);
        }
        this.state.score += this.enemies.length * 100;
        this.state.enemiesRemaining -= this.enemies.length;
        this.enemies = [];
        break;
      case PowerUpType.STAR:
        this.player.upgrade();
        break;
      case PowerUpType.SHOVEL:
        this.fortifyBase();
        this.fortifiedTimer = 15000;
        break;
    }
  }

  private fortifyBase(): void {
    // Find base tiles and replace surrounding bricks with steel
    this.originalBaseTiles = [];
    for (let y = 21; y <= 24; y++) {
      for (let x = 10; x <= 15; x++) {
        const tile = this.getTile(x, y);
        if (tile === TileType.BRICK) {
          this.originalBaseTiles.push({ x, y, tile });
          this.setTile(x, y, TileType.STEEL);
        }
      }
    }
  }

  private revertBaseFortification(): void {
    for (const { x, y, tile } of this.originalBaseTiles) {
      this.setTile(x, y, tile);
    }
    this.originalBaseTiles = [];
  }

  private respawnPlayer(): void {
    const spawn = getPlayerSpawn();
    this.player = new Tank('p1', spawn.x, spawn.y, TankType.NORMAL, true);
    this.player.setInvincible(3000);
  }

  private checkGameConditions(): void {
    if (this.state.baseDestroyed || this.state.lives <= 0) {
      this.state.scene = 'gameover';
    } else if (this.state.enemiesRemaining <= 0 && this.enemies.length === 0) {
      this.state.scene = 'levelcomplete';
    }
  }

  nextLevel(): void {
    this.state.level++;
    this.startGame(this.state.level);
  }

  restartGame(): void {
    this.state.score = 0;
    this.state.lives = 3;
    this.startGame(0);
  }

  pause(): void {
    if (this.state.scene === 'game') {
      this.state.scene = 'pause';
    }
  }

  resume(): void {
    if (this.state.scene === 'pause') {
      this.state.scene = 'game';
    }
  }

  setInput(key: keyof typeof this.inputState, value: boolean): void {
    this.inputState[key] = value;
  }
  // ---- dt-ms wrappers for legacy seconds-based updaters ----
  private updateExplosionsMs(dtMs: number): void {
    const dt = dtMs / 1000;
    // @ts-ignore - existing method
    this.updateExplosions(dt);
  }

  private updatePowerUpsMs(dtMs: number): void {
    const dt = dtMs / 1000;
    // @ts-ignore - existing method
    this.updatePowerUps(dt);
  }

/** 导出可序列化快照（房主端发送） */
toNetworkSnapshot(): EngineSnapshot {
  const tankToNet = (tk: Tank | null): TankNet | null => {
    if (!tk) return null;
    return {
      id: tk.id,
      x: tk.x,
      y: tk.y,
      direction: tk.direction,
      type: tk.type,
      isPlayer: tk.isPlayer,
      health: tk.health,
      activeBullets: tk.activeBullets,
      isInvincible: tk.isInvincible,
      invincibleTimer: tk.invincibleTimer,
      fireLevel: tk.fireLevel,
      moveCooldown: tk.moveCooldown,
      fireCooldown: tk.fireCooldown,
      onIce: tk.onIce,
      vx: tk.velocity?.vx,
      vy: tk.velocity?.vy,
    };
  };

  const map = this.map.map(row => [...row]);

  const bullets: BulletNet[] = this.bulletPool.getActive()
    .filter(b => (b as any).active)
    .map(b => ({ ...(b as any) })) as any;

  const explosions: ExplosionNet[] = this.explosionPool.getActive()
    .filter(e => (e as any).active)
    .map(e => ({ ...(e as any) })) as any;

  const powerUps: PowerUpNet[] = this.powerUps.map(p => ({ ...(p as any) })) as any;

  return {
    t: Date.now(),
    level: this.state.level,
    map,
    p1: tankToNet(this.player),
    p2: tankToNet(this.remotePlayer),
    enemies: this.enemies.map(e => tankToNet(e)!).filter(Boolean) as any,
    bullets,
    explosions,
    powerUps,
    baseDestroyed: this.state.baseDestroyed,
    score: this.state.score,
  };
}

/** 应用网络快照（非房主端渲染使用） */
applyNetworkSnapshot(s: EngineSnapshot): void {
  this.multiplayerEnabled = true;

  this.state.scene = 'game';
  this.state.level = s.level;
  this.state.score = s.score;
  this.state.baseDestroyed = s.baseDestroyed;

  this.map = s.map.map(row => [...row]);

  const applyTank = (existing: Tank | null, data: TankNet | null): Tank | null => {
    if (!data) return null;
    const tk = existing ?? new Tank(data.id, data.x, data.y, data.type, !!data.isPlayer);
    tk.id = data.id;
    tk.x = data.x;
    tk.y = data.y;
    tk.direction = data.direction;
    tk.type = data.type;
    tk.isPlayer = !!data.isPlayer;
    tk.health = data.health;
    tk.activeBullets = data.activeBullets;
    tk.isInvincible = data.isInvincible;
    tk.invincibleTimer = data.invincibleTimer;
    tk.fireLevel = data.fireLevel;
    tk.moveCooldown = data.moveCooldown;
    tk.fireCooldown = data.fireCooldown;
    tk.onIce = !!data.onIce;
    if (tk.velocity) {
      tk.velocity.vx = data.vx ?? 0;
      tk.velocity.vy = data.vy ?? 0;
    }
    return tk;
  };

  this.player = applyTank(this.player, s.p1);
  this.remotePlayer = applyTank(this.remotePlayer, s.p2);

  // enemies（如果未来要做 coop，可继续沿用）
  this.enemies = (s.enemies || []).map(d => applyTank(null, d)!).filter(Boolean) as any;

  // bullets
  this.bulletPool.releaseAll();
  for (const b of (s.bullets || [])) {
    const bb = this.bulletPool.acquire() as any;
    Object.assign(bb, b);
    bb.active = true;
  }

  // explosions
  this.explosionPool.releaseAll();
  for (const e of (s.explosions || [])) {
    const ee = this.explosionPool.acquire() as any;
    Object.assign(ee, e);
    ee.active = true;
  }

  // power-ups
  this.powerUps = (s.powerUps || []).map(p => ({ ...(p as any) })) as any;
}

}
