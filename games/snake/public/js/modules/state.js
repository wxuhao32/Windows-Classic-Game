import { randInt, eqPos } from "./utils.js";

export const DIRS = {
  up:    { x: 0, y:-1 },
  down:  { x: 0, y: 1 },
  left:  { x:-1, y: 0 },
  right: { x: 1, y: 0 },
};

export const DEFAULTS = {
  grid: 24,
  startLen: 4,
  startDir: "right",
  baseTickMs: 145,
  minTickMs: 58,
};

export function createInitialState(opts = {}){
  const grid = opts.grid ?? DEFAULTS.grid;
  const startLen = opts.startLen ?? DEFAULTS.startLen;

  const cx = Math.floor(grid / 2);
  const cy = Math.floor(grid / 2);

  const snake = [];
  for(let i=0;i<startLen;i++){
    snake.push({ x: cx - i, y: cy });
  }

  const food = spawnFood(grid, snake);

  return {
    grid,
    snake,
    food,
    dirKey: opts.startDir ?? DEFAULTS.startDir,
    nextDirKey: opts.startDir ?? DEFAULTS.startDir,
    alive: true,
    started: false,

    score: 0,
    best: loadBest(),

    // speed control
    tickMs: opts.baseTickMs ?? DEFAULTS.baseTickMs,
    baseTickMs: opts.baseTickMs ?? DEFAULTS.baseTickMs,
    minTickMs: opts.minTickMs ?? DEFAULTS.minTickMs,

    // used for time-based acceleration
    steps: 0,         // how many moves we’ve made
    startedAt: 0,     // timestamp when run starts (ms, perf.now style)
  };
}

export function spawnFood(grid, snake){
  // keep trying until we find a free cell
  for(let tries=0; tries<10_000; tries++){
    const p = { x: randInt(0, grid-1), y: randInt(0, grid-1) };
    if(!snake.some(s => eqPos(s, p))) return p;
  }
  // fallback (should never happen)
  return { x: 0, y: 0 };
}

export function loadBest(){
  const raw = localStorage.getItem("snake.best");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function saveBest(v){
  localStorage.setItem("snake.best", String(v));
}
