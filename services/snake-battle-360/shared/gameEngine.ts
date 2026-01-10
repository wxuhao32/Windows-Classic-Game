/**
 * Slither-like 360° snake battle engine (shared)
 *
 * Key rules implemented:
 * - 360° steering via analog stick (joystick).
 * - Snakes always move forward (cannot stop).
 * - Limited turn rate (smooth).
 * - Large rectangular world with hard walls (hit wall => death).
 * - Head hits any other snake body => death.
 * - On death, snake explodes into collectible food particles.
 *   Total collectible value ≈ 28% of victim length (within 1/3~1/4).
 */

export interface Vec2 {
  x: number;
  y: number;
}

// Backwards-compatible alias (older code used Position)
export type Position = Vec2;

export interface FoodParticle {
  id: string;
  position: Vec2;
  radius: number;
  /** length units granted when eaten */
  value: number;
  /** purely visual hint */
  kind: "dot" | "orb" | "loot";
  color: string;
  /** simple physics for death scatter */
  vx: number;
  vy: number;
  /** ms timestamp */
  createdAt: number;
  /** particles slow down and stop after this time */
  movingUntil: number;
}

export interface Snake {
  id: string;
  /** segment centers from head(0) -> tail */
  body: Vec2[];
  /** current heading angle in radians */
  angle: number;
  /** desired heading angle (from joystick/AI). If undefined => keep current */
  targetAngle?: number;
  /** 0..1, from joystick magnitude; affects steering responsiveness a bit */
  steerStrength: number;
  speed: number; // units/sec
  radius: number; // units
  /** desired total body length in world units */
  length: number;
  color: string;
  score: number;
  isAlive: boolean;
  isPlayer: boolean;
  controlledBy?: string;
  playerName?: string;
}

export interface GameState {
  snakes: Snake[];
  food: FoodParticle[];

  /** viewport size (canvas) */
  viewWidth: number;
  viewHeight: number;

  /** world size */
  worldWidth: number;
  worldHeight: number;

  isRunning: boolean;
  isPaused: boolean;
  gameTime: number; // ms

  /** bookkeeping for server/offline */
  desiredSnakeCount: number;
}

// ---------------------------------------------------------------------------
// Tunables (game feel)
// ---------------------------------------------------------------------------

export const WORLD_WIDTH = 6000;
export const WORLD_HEIGHT = 4000;

export const VIEW_WIDTH_DEFAULT = 800;
export const VIEW_HEIGHT_DEFAULT = 600;

export const SNAKE_RADIUS = 10;
export const SEGMENT_SPACING = 8; // segment-to-segment target spacing
export const START_LENGTH = 220; // units

export const BASE_SPEED = 170; // units/sec
export const MAX_TURN_RATE = Math.PI * 3.0; // rad/sec (≈540°/s) 更跟手

export const FOOD_TARGET = 260;
export const FOOD_SPAWN_PER_TICK = 6;
export const FOOD_MAX = 650;

export const FOOD_DOT_VALUE = 10;
export const FOOD_ORB_VALUE = 22;

export const DEATH_YIELD_RATIO = 0.28; // 1/3~1/4-ish
export const DEATH_PARTICLE_VALUE = 10;
export const DEATH_PARTICLE_MIN = 40;
export const DEATH_PARTICLE_MAX = 220;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function len(v: Vec2) {
  return Math.hypot(v.x, v.y);
}

function norm(v: Vec2): Vec2 {
  const l = len(v);
  if (!l) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleToVec(a: number): Vec2 {
  return { x: Math.cos(a), y: Math.sin(a) };
}

function wrapAngle(a: number) {
  // [-pi, pi)
  while (a >= Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function rotateTowards(current: number, target: number, maxDelta: number) {
  let delta = wrapAngle(target - current);
  delta = clamp(delta, -maxDelta, maxDelta);
  return wrapAngle(current + delta);
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
}

// Simple bright palette (cartoony)
const SNAKE_COLORS = ["#00ff88", "#ff00ff", "#00ffff", "#ff6600", "#ffff33", "#66a3ff"];

const FOOD_COLORS = ["#ffff33", "#ff66ff", "#66ffff", "#66ff66", "#ffaa33"];

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initializeGame(viewWidth = VIEW_WIDTH_DEFAULT, viewHeight = VIEW_HEIGHT_DEFAULT, aiCount = 10): GameState {
  const snakes: Snake[] = [];
  const center: Vec2 = { x: WORLD_WIDTH * 0.35, y: WORLD_HEIGHT * 0.5 };

  // Player snake
  snakes.push(
    createSnake({
      id: "player",
      position: center,
      color: SNAKE_COLORS[0],
      isPlayer: true,
      controlledBy: "local",
      playerName: "玩家",
      angle: 0,
    })
  );

  // AI snakes
  for (let i = 0; i < aiCount; i++) {
    const pos: Vec2 = {
      x: randomRange(WORLD_WIDTH * 0.15, WORLD_WIDTH * 0.85),
      y: randomRange(WORLD_HEIGHT * 0.15, WORLD_HEIGHT * 0.85),
    };
    snakes.push(
      createSnake({
        id: `ai-${i}`,
        position: pos,
        color: SNAKE_COLORS[(i + 1) % SNAKE_COLORS.length],
        isPlayer: false,
        angle: randomRange(-Math.PI, Math.PI),
      })
    );
  }

  const state: GameState = {
    snakes,
    food: [],
    viewWidth,
    viewHeight,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    isRunning: true,
    isPaused: false,
    gameTime: 0,
    desiredSnakeCount: 1 + aiCount,
  };

  seedFood(state, FOOD_TARGET);
  return state;
}

export function initializeArena(viewWidth = VIEW_WIDTH_DEFAULT, viewHeight = VIEW_HEIGHT_DEFAULT, snakeCount = 18): GameState {
  const snakes: Snake[] = [];
  for (let i = 0; i < snakeCount; i++) {
    const pos: Vec2 = {
      x: randomRange(WORLD_WIDTH * 0.15, WORLD_WIDTH * 0.85),
      y: randomRange(WORLD_HEIGHT * 0.15, WORLD_HEIGHT * 0.85),
    };
    snakes.push(
      createSnake({
        id: `snake-${i}`,
        position: pos,
        color: SNAKE_COLORS[i % SNAKE_COLORS.length],
        isPlayer: false,
        angle: randomRange(-Math.PI, Math.PI),
      })
    );
  }

  const state: GameState = {
    snakes,
    food: [],
    viewWidth,
    viewHeight,
    worldWidth: WORLD_WIDTH,
    worldHeight: WORLD_HEIGHT,
    isRunning: true,
    isPaused: false,
    gameTime: 0,
    desiredSnakeCount: snakeCount,
  };

  seedFood(state, FOOD_TARGET);
  return state;
}

function createSnake(args: {
  id: string;
  position: Vec2;
  color: string;
  isPlayer: boolean;
  angle: number;
  controlledBy?: string;
  playerName?: string;
}): Snake {
  const forward = angleToVec(args.angle);
  // Create a straight initial body behind head
  const segCount = Math.ceil(START_LENGTH / SEGMENT_SPACING);
  const body: Vec2[] = [];
  for (let i = 0; i < segCount; i++) {
    body.push({
      x: args.position.x - forward.x * i * SEGMENT_SPACING,
      y: args.position.y - forward.y * i * SEGMENT_SPACING,
    });
  }
  return {
    id: args.id,
    body,
    angle: wrapAngle(args.angle),
    targetAngle: wrapAngle(args.angle),
    steerStrength: 0,
    speed: BASE_SPEED,
    radius: SNAKE_RADIUS,
    length: START_LENGTH,
    color: args.color,
    score: 0,
    isAlive: true,
    isPlayer: args.isPlayer,
    controlledBy: args.controlledBy,
    playerName: args.playerName,
  };
}

/**
 * ✅ FIXED:
 * 这里原本误留了 `if (snake.id === "player") ...`，导致 `snake` 未定义直接崩溃。
 * seedFood 只负责按数量补充食物，不应该依赖任何一条蛇。
 */
function seedFood(state: GameState, count: number) {
  for (let i = 0; i < count; i++) {
    state.food.push(spawnFood(state, "dot"));
  }
}

function spawnFood(state: GameState, kind: "dot" | "orb" | "loot"): FoodParticle {
  const now = Date.now();
  const isOrb = kind === "orb";
  const radius = isOrb ? randomRange(7, 10) : randomRange(4, 6);
  const value = isOrb ? FOOD_ORB_VALUE : FOOD_DOT_VALUE;
  const pos = randomFreePosition(state, radius + 3);
  return {
    id: makeId("food"),
    position: pos,
    radius,
    value,
    kind,
    color: pick(FOOD_COLORS),
    vx: 0,
    vy: 0,
    createdAt: now,
    movingUntil: now,
  };
}

function randomFreePosition(state: GameState, padding: number): Vec2 {
  // Best-effort: try a few times to avoid spawning inside a snake body.
  for (let attempt = 0; attempt < 12; attempt++) {
    const pos: Vec2 = {
      x: randomRange(padding, state.worldWidth - padding),
      y: randomRange(padding, state.worldHeight - padding),
    };
    let ok = true;
    for (const s of state.snakes) {
      if (!s.isAlive) continue;
      // Cheap check: only compare to a few head-near segments
      for (let i = 0; i < Math.min(s.body.length, 40); i++) {
        if (dist(pos, s.body[i]) < s.radius + padding) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (ok) return pos;
  }
  return {
    x: randomRange(padding, state.worldWidth - padding),
    y: randomRange(padding, state.worldHeight - padding),
  };
}

// ---------------------------------------------------------------------------
// Inputs (stick)
// ---------------------------------------------------------------------------

/**
 * Offline convenience: set the local player's stick vector.
 */
export function setPlayerStick(state: GameState, stick: Vec2) {
  setSnakeStick(state, "player", stick);
}

/**
 * Set a snake's desired direction using an analog stick vector.
 * stick in [-1,1], magnitude controls steerStrength.
 */
export function setSnakeStick(state: GameState, snakeId: string, stick: Vec2) {
  const snake = state.snakes.find((s) => s.id === snakeId);
  if (!snake || !snake.isAlive) return;

  // ✅ 更跟手：降低死区 + 重新映射力度（避免“摇杆推不动 / 转向延迟大”）
  const DEAD = 0.06; // normalized
  const raw = clamp(len(stick), 0, 1);

  if (raw < DEAD) {
    snake.steerStrength = 0;
    // neutral => keep current heading (no extra turning)
    snake.targetAngle = snake.angle;
    return;
  }

  // remap after deadzone and apply a curve so mid-strength steering feels snappier
  let strength = clamp((raw - DEAD) / (1 - DEAD), 0, 1);
  strength = Math.sqrt(strength); // curve: more responsive around mid-range
  snake.steerStrength = strength;

  const v = norm(stick);
  snake.targetAngle = Math.atan2(v.y, v.x);
}

export function togglePause(state: GameState) {
  state.isPaused = !state.isPaused;
}

// ---------------------------------------------------------------------------
// Multiplayer: claim/release
// ---------------------------------------------------------------------------

export function claimSnake(state: GameState, snakeId: string, clientId: string, playerName: string): boolean {
  const s = state.snakes.find((x) => x.id === snakeId);
  if (!s || !s.isAlive) return false;
  if (s.controlledBy && s.controlledBy !== clientId) return false;

  s.isPlayer = true;
  s.controlledBy = clientId;
  s.playerName = playerName;
  return true;
}

export function releaseClientSnakes(state: GameState, clientId: string) {
  for (const s of state.snakes) {
    if (s.controlledBy === clientId) {
      s.isPlayer = false;
      s.controlledBy = undefined;
      s.playerName = undefined;
      s.steerStrength = 0;
      s.targetAngle = s.angle;
    }
  }
}

/**
 * 多人联机：为某个客户端生成“专属玩家蛇”（不再需要自由接管 AI 蛇）。
 * - 如果客户端已有一条存活蛇，则复用。
 * - 新蛇随机出生在世界中部区域，避免贴墙秒死。
 */
export function spawnPlayerSnake(state: GameState, clientId: string, playerName: string): string {
  const existing = state.snakes.find((s) => s.isAlive && s.controlledBy === clientId);
  if (existing) {
    existing.isPlayer = true;
    existing.playerName = playerName;
    existing.controlledBy = clientId;
    return existing.id;
  }

  const id = `p-${clientId.slice(0, 8)}-${Date.now().toString(16)}`;
  const pos: Vec2 = {
    x: randomRange(state.worldWidth * 0.2, state.worldWidth * 0.8),
    y: randomRange(state.worldHeight * 0.2, state.worldHeight * 0.8),
  };
  const angle = randomRange(-Math.PI, Math.PI);

  state.snakes.push(
    createSnake({
      id,
      position: pos,
      color: pick(SNAKE_COLORS),
      isPlayer: true,
      angle,
      controlledBy: clientId,
      playerName,
    })
  );

  return id;
}

/** 断线/离开：移除该客户端控制的玩家蛇（避免“幽灵玩家”占坑） */
export function removeClientPlayers(state: GameState, clientId: string) {
  state.snakes = state.snakes.filter((s) => s.controlledBy !== clientId);
}


// ---------------------------------------------------------------------------
// Update loop
// ---------------------------------------------------------------------------

export function updateGame(state: GameState, dtMs: number) {
  if (!state.isRunning) return;
  if (state.isPaused) {
    state.gameTime += dtMs;
    return;
  }

  const dt = dtMs / 1000;
  state.gameTime += dtMs;

  // Spawn food gradually (keeps density)
  if (state.food.length < FOOD_TARGET) {
    const toSpawn = Math.min(FOOD_SPAWN_PER_TICK, FOOD_TARGET - state.food.length);
    for (let i = 0; i < toSpawn; i++) {
      const kind = Math.random() < 0.12 ? "orb" : "dot";
      state.food.push(spawnFood(state, kind));
    }
  }

  // Hard cap food count (avoids unbounded payload size in multiplayer)
  if (state.food.length > FOOD_MAX) {
    // Prefer trimming oldest non-loot (random-ish)
    let drop = state.food.length - FOOD_MAX;
    for (let i = 0; i < state.food.length && drop > 0; ) {
      if (state.food[i].kind !== "loot") {
        state.food.splice(i, 1);
        drop--;
        continue;
      }
      i++;
    }
    // Still too many => trim from head
    if (state.food.length > FOOD_MAX) {
      state.food.splice(0, state.food.length - FOOD_MAX);
    }
  }

  // Update food scatter physics
  const now = Date.now();
  for (const f of state.food) {
    if (now <= f.movingUntil) {
      f.position.x += f.vx * dt;
      f.position.y += f.vy * dt;
      // soft damping
      f.vx *= Math.pow(0.06, dt);
      f.vy *= Math.pow(0.06, dt);
      // clamp to bounds
      f.position.x = clamp(f.position.x, f.radius, state.worldWidth - f.radius);
      f.position.y = clamp(f.position.y, f.radius, state.worldHeight - f.radius);
    }
  }

  // AI decide
  for (const s of state.snakes) {
    if (!s.isAlive) continue;
    if (s.isPlayer && s.controlledBy) continue; // human controlled
    aiSteer(state, s);
  }

  // Move snakes
  for (const s of state.snakes) {
    if (!s.isAlive) continue;

    const maxDelta = MAX_TURN_RATE * dt * (0.30 + 0.70 * clamp(s.steerStrength || 0, 0, 1));
    if (s.targetAngle !== undefined) {
      s.angle = rotateTowards(s.angle, s.targetAngle, maxDelta);
    }
    const forward = angleToVec(s.angle);

    const head = s.body[0];
    const newHead = {
      x: head.x + forward.x * s.speed * dt,
      y: head.y + forward.y * s.speed * dt,
    };

    // Wall collision (hard)
    if (
      newHead.x < s.radius ||
      newHead.x > state.worldWidth - s.radius ||
      newHead.y < s.radius ||
      newHead.y > state.worldHeight - s.radius
    ) {
      killSnake(state, s, "wall");
      continue;
    }

    // Insert new head point
    const raw = [newHead, ...s.body];

    // Keep enough points (for resampling). Duplicate tail if necessary.
    while (raw.length < 3) raw.push({ ...raw[raw.length - 1] });

    // Desired segments count
    const targetSegments = Math.max(8, Math.ceil(s.length / SEGMENT_SPACING));
    const resampled = resamplePolyline(raw, SEGMENT_SPACING, targetSegments);
    s.body = resampled;
  }

  // Collisions: head hits other bodies
  for (const a of state.snakes) {
    if (!a.isAlive) continue;
    const head = a.body[0];
    for (const b of state.snakes) {
      if (!b.isAlive) continue;
      if (a.id === b.id) continue;
      // skip b head and a few near-head segments for fairness
      const start = Math.min(6, b.body.length);
      for (let i = start; i < b.body.length; i++) {
        if (dist(head, b.body[i]) < a.radius + b.radius * 0.92) {
          killSnake(state, a, "snake");
          break;
        }
      }
      if (!a.isAlive) break;
    }
  }

  // Eating food: iterate in reverse for safe splicing
  for (const s of state.snakes) {
    if (!s.isAlive) continue;
    const head = s.body[0];
    for (let i = state.food.length - 1; i >= 0; i--) {
      const f = state.food[i];
      if (dist(head, f.position) < s.radius + f.radius + 2.5) {
        s.length += f.value;
        s.score += Math.round(f.value);
        state.food.splice(i, 1);
      }
    }
  }

  // Optional: keep population (respawn AI-only) so the world doesn't get empty.
  const aliveCount = state.snakes.filter((s) => s.isAlive).length;
  if (aliveCount < Math.max(6, Math.floor(state.desiredSnakeCount * 0.6))) {
    // respawn 1-2 AI per tick if needed
    const need = Math.min(2, state.desiredSnakeCount - aliveCount);
    for (let i = 0; i < need; i++) {
      const id = makeId("ai");
      state.snakes.push(
        createSnake({
          id,
          position: {
            x: randomRange(state.worldWidth * 0.2, state.worldWidth * 0.8),
            y: randomRange(state.worldHeight * 0.2, state.worldHeight * 0.8),
          },
          color: pick(SNAKE_COLORS),
          isPlayer: false,
          angle: randomRange(-Math.PI, Math.PI),
        })
      );
    }
    // prevent unbounded growth of snakes array
    if (state.snakes.length > state.desiredSnakeCount * 2) {
      state.snakes = state.snakes.filter((s) => s.isAlive);
    }
  }

  // Offline: end game if player's snake is dead
  const player = state.snakes.find((s) => s.id === "player");
  if (player && player.isPlayer && player.controlledBy === "local" && !player.isAlive) {
    state.isRunning = false;
  }
}

function resamplePolyline(points: Vec2[], spacing: number, targetCount: number): Vec2[] {
  if (points.length === 0) return [];
  const out: Vec2[] = [points[0]];

  let remaining = spacing;
  let prev = points[0];

  for (let i = 1; i < points.length && out.length < targetCount; i++) {
    let cur = points[i];
    let segLen = dist(prev, cur);
    if (segLen === 0) continue;

    while (segLen >= remaining && out.length < targetCount) {
      const t = remaining / segLen;
      const nx = prev.x + (cur.x - prev.x) * t;
      const ny = prev.y + (cur.y - prev.y) * t;
      const np = { x: nx, y: ny };
      out.push(np);
      prev = np;
      segLen = dist(prev, cur);
      remaining = spacing;
    }

    remaining -= segLen;
    prev = cur;
  }

  // If not enough points, extend tail by duplicating last.
  while (out.length < targetCount) {
    out.push({ ...out[out.length - 1] });
  }
  return out;
}

function killSnake(state: GameState, snake: Snake, reason: "wall" | "snake") {
  if (!snake.isAlive) return;
  snake.isAlive = false;

  // Release control if multiplayer
  snake.isPlayer = false;
  snake.controlledBy = undefined;

  // Spawn loot particles along the body
  const now = Date.now();
  const totalYield = snake.length * DEATH_YIELD_RATIO;
  const count = clamp(Math.floor(totalYield / DEATH_PARTICLE_VALUE), DEATH_PARTICLE_MIN, DEATH_PARTICLE_MAX);
  const each = totalYield / count;

  for (let i = 0; i < count; i++) {
    const t = i / count;
    const idx = Math.floor(t * (snake.body.length - 1));
    const base = snake.body[idx] || snake.body[snake.body.length - 1];
    const ang = randomRange(-Math.PI, Math.PI);
    const spd = randomRange(60, 160);
    const r = randomRange(3.5, 5.6);
    state.food.push({
      id: makeId("loot"),
      position: {
        x: base.x + randomRange(-snake.radius * 1.1, snake.radius * 1.1),
        y: base.y + randomRange(-snake.radius * 1.1, snake.radius * 1.1),
      },
      radius: r,
      value: each,
      kind: "loot",
      color: pick(FOOD_COLORS),
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      createdAt: now,
      movingUntil: now + 650,
    });
  }

  // Keep the game running even if one snake dies (online arena). Offline ends handled in updateGame.
  if (reason === "wall" || reason === "snake") {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// AI (simple but "threatening")
// ---------------------------------------------------------------------------

function aiSteer(state: GameState, s: Snake) {
  const head = s.body[0];

  // 1) Target: nearest food within some range
  let bestFood: FoodParticle | null = null;
  let bestD = Infinity;
  const searchR = 900;
  for (const f of state.food) {
    const d = dist(head, f.position);
    if (d < bestD && d < searchR) {
      bestD = d;
      bestFood = f;
    }
  }
  const desired: Vec2 = bestFood
    ? { x: bestFood.position.x - head.x, y: bestFood.position.y - head.y }
    : angleToVec(s.angle);

  // 2) Avoid walls (repulsion)
  const margin = 240;
  let avoid: Vec2 = { x: 0, y: 0 };
  if (head.x < margin) avoid.x += (margin - head.x) / margin;
  if (head.x > state.worldWidth - margin) avoid.x -= (head.x - (state.worldWidth - margin)) / margin;
  if (head.y < margin) avoid.y += (margin - head.y) / margin;
  if (head.y > state.worldHeight - margin) avoid.y -= (head.y - (state.worldHeight - margin)) / margin;

  // 3) Avoid other bodies (local repulsion)
  for (const other of state.snakes) {
    if (!other.isAlive || other.id === s.id) continue;
    // check only a subset for perf
    const upto = Math.min(other.body.length, 40);
    for (let i = 6; i < upto; i += 2) {
      const p = other.body[i];
      const d = dist(head, p);
      if (d < 170) {
        const away = norm({ x: head.x - p.x, y: head.y - p.y });
        const k = (170 - d) / 170;
        avoid.x += away.x * k * 1.4;
        avoid.y += away.y * k * 1.4;
      }
    }
  }

  // Mix goal and avoidance
  const goal = norm(desired);
  const mix = norm({ x: goal.x + avoid.x * 1.7, y: goal.y + avoid.y * 1.7 });
  const m = len(mix);
  if (m < 0.01) {
    s.targetAngle = s.angle;
    s.steerStrength = 0.25;
    return;
  }
  s.targetAngle = Math.atan2(mix.y, mix.x);
  s.steerStrength = 0.55;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function getRankings(state: GameState) {
  return state.snakes
    .map((s) => ({
      id: s.id,
      name: s.playerName || (s.isPlayer ? "玩家" : "AI"),
      color: s.color,
      isAlive: s.isAlive,
      length: Math.round(s.length),
      score: Math.round(s.score),
      isPlayer: s.isPlayer,
    }))
    .sort((a, b) => b.length - a.length);
}
