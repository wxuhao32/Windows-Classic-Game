/* Snake Arcade - prebuilt bundle for file:// and server */
(function(){
  'use strict';
  window.SnakeArcade = window.SnakeArcade || {};
})();

(function(ns){
  "use strict";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function randInt(min, maxInclusive){
  return Math.floor(Math.random() * (maxInclusive - min + 1)) + min;
}

function eqPos(a, b){
  return a.x === b.x && a.y === b.y;
}

function oppositeDir(a, b){
  return (a.x === -b.x && a.y === -b.y);
}

function now(){
  return (typeof performance !== "undefined" ? performance.now() : Date.now());
}

  ns.clamp = clamp;
  ns.randInt = randInt;
  ns.eqPos = eqPos;
  ns.oppositeDir = oppositeDir;
  ns.now = now;
})(window.SnakeArcade);


(function(ns){
  "use strict";
  const { randInt, eqPos } = ns;

const DIRS = {
  up:    { x: 0, y:-1 },
  down:  { x: 0, y: 1 },
  left:  { x:-1, y: 0 },
  right: { x: 1, y: 0 },
};

const DEFAULTS = {
  grid: 24,
  startLen: 4,
  startDir: "right",
  baseTickMs: 145,
  minTickMs: 58,
};

function createInitialState(opts = {}){
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

function spawnFood(grid, snake){
  // keep trying until we find a free cell
  for(let tries=0; tries<10_000; tries++){
    const p = { x: randInt(0, grid-1), y: randInt(0, grid-1) };
    if(!snake.some(s => eqPos(s, p))) return p;
  }
  // fallback (should never happen)
  return { x: 0, y: 0 };
}

function loadBest(){
  const raw = localStorage.getItem("snake.best");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function saveBest(v){
  localStorage.setItem("snake.best", String(v));
}

  ns.DIRS = DIRS;
  ns.DEFAULTS = DEFAULTS;
  ns.createInitialState = createInitialState;
  ns.spawnFood = spawnFood;
  ns.loadBest = loadBest;
  ns.saveBest = saveBest;
})(window.SnakeArcade);


(function(ns){
  "use strict";
  const { clamp } = ns;

// Retro colors are driven by CSS theme; canvas uses computed styles.
// We sample CSS variables once per frame (cheap enough on modern devices).
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function createRenderer(canvas){
  const ctx = canvas.getContext("2d", { alpha: false });

  function clear(){
    // Background fill
    ctx.fillStyle = cssVar("--panel");
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  function drawGrid(grid){
    const w = canvas.width;
    const h = canvas.height;
    const cell = w / grid;

    const thin = cssVar("--grid");
    const bold = cssVar("--gridBold");

    ctx.save();
    ctx.lineWidth = 1;
    ctx.beginPath();

    for(let i=0;i<=grid;i++){
      const x = Math.round(i * cell) + 0.5;
      const y = Math.round(i * cell) + 0.5;

      ctx.strokeStyle = (i % 4 === 0) ? bold : thin;

      // vertical
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      // horizontal
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCell(p, grid, style){
    const cell = canvas.width / grid;
    const x = p.x * cell;
    const y = p.y * cell;

    ctx.fillStyle = style.fill;
    ctx.fillRect(x, y, cell, cell);

    if(style.stroke){
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.lineWidth ?? 2;
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    }

    if(style.inner){
      ctx.fillStyle = style.inner;
      const pad = clamp(Math.floor(cell * 0.18), 2, 6);
      ctx.fillRect(x + pad, y + pad, cell - pad*2, cell - pad*2);
    }
  }

  function drawSnake(state){
    const accent = cssVar("--accent");
    const accent2 = cssVar("--accent2");
    const text = cssVar("--text");

    // Body first
    for(let i=state.snake.length-1;i>=0;i--){
      const seg = state.snake[i];
      const isHead = (i === 0);

      if(isHead){
        drawCell(seg, state.grid, {
          fill: accent2,
          inner: "rgba(255,255,255,0.22)",
          stroke: text,
          lineWidth: 2,
        });

        // tiny "eyes"
        const cell = canvas.width / state.grid;
        const x = seg.x * cell;
        const y = seg.y * cell;
        ctx.fillStyle = cssVar("--panel");
        const e = Math.max(2, Math.floor(cell*0.12));
        const ox = Math.floor(cell*0.22);
        const oy = Math.floor(cell*0.28);
        ctx.fillRect(x+ox, y+oy, e, e);
        ctx.fillRect(x+cell-ox-e, y+oy, e, e);
      } else {
        drawCell(seg, state.grid, {
          fill: accent,
          inner: "rgba(0,0,0,0.14)",
        });
      }
    }
  }

  function drawFood(state){
    // Use an emoji for the food to look nicer across platforms.
    // We still keep a subtle highlight behind it so it reads well on the grid.
    const cell = canvas.width / state.grid;
    const x = state.food.x * cell;
    const y = state.food.y * cell;

    // soft background highlight
    ctx.save();
    ctx.fillStyle = "rgba(255,77,109,0.18)";
    ctx.fillRect(x, y, cell, cell);

    // emoji
    const size = Math.max(14, Math.floor(cell * 0.78));
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🍎", Math.round(x + cell/2), Math.round(y + cell/2 + cell*0.05));
    ctx.restore();
  }

  function render(state){
    clear();
    drawGrid(state.grid);
    drawFood(state);
    drawSnake(state);
  }

  return { canvas, ctx, render };
}

  ns.createRenderer = createRenderer;
})(window.SnakeArcade);


 (function(ns){
  "use strict";
const SFX_KEY = "snake.sound";
const MUSIC_KEY = "snake.music";
const DEFAULT_MUSIC_SRC = "./audio/bgm.mp3";

function createAudio(){
  let ctx = null;
  let sfxEnabled = loadSfxEnabled();

  let musicEnabled = loadMusicEnabled();
  let musicSrc = DEFAULT_MUSIC_SRC;
  let musicEl = null;

  function loadSfxEnabled(){
    const raw = localStorage.getItem(SFX_KEY);
    if(raw === null) return true;
    return raw === "1";
  }

  function saveSfxEnabled(v){
    localStorage.setItem(SFX_KEY, v ? "1" : "0");
  }

  function loadMusicEnabled(){
    const raw = localStorage.getItem(MUSIC_KEY);
    if(raw === null) return false;
    return raw === "1";
  }

  function saveMusicEnabled(v){
    localStorage.setItem(MUSIC_KEY, v ? "1" : "0");
  }

  function ensureMusicEl(){
    if(!musicEl){
      musicEl = new Audio(musicSrc);
      musicEl.loop = true;
      musicEl.preload = "auto";
      musicEl.volume = 0.35;
      musicEl.playsInline = true;
    }
    return musicEl;
  }

  function playMusic(){
    if(!musicEnabled) return;
    try {
      const el = ensureMusicEl();
      const p = el.play();
      if(p && typeof p.catch === "function"){
        p.catch(()=>{});
      }
    } catch {
      // ignore
    }
  }

  function stopMusic(){
    if(!musicEl) return;
    try {
      musicEl.pause();
      musicEl.currentTime = 0;
    } catch {
      // ignore
    }
  }

  function ensureUnlocked(){
    // Must be called from user gesture to avoid autoplay blocks
    if(!ctx){
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
    }
    if(ctx.state === "suspended"){
      ctx.resume().catch(()=>{});
    }
    if(musicEnabled){
      playMusic();
    }
  }

  function setSfxEnabled(v){
    sfxEnabled = !!v;
    saveSfxEnabled(sfxEnabled);
  }

  function isSfxEnabled(){
    return sfxEnabled;
  }

  function setMusicEnabled(v){
    musicEnabled = !!v;
    saveMusicEnabled(musicEnabled);
    if(!musicEnabled){
      stopMusic();
    } else {
      playMusic();
    }
  }

  function isMusicEnabled(){
    return musicEnabled;
  }

  function setMusicSrc(src){
    musicSrc = src || DEFAULT_MUSIC_SRC;
    if(musicEl){
      const wasPlaying = !musicEl.paused;
      musicEl.pause();
      musicEl = null;
      if(wasPlaying && musicEnabled){
        playMusic();
      }
    }
  }

  function beep({ freq=440, duration=0.06, type="square", gain=0.06, slideTo=null } = {}){
    if(!sfxEnabled || !ctx) return;

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if(slideTo){
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + duration);
    }

    // snappy envelope
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(g);
    g.connect(ctx.destination);

    osc.start(t0);
    osc.stop(t0 + duration + 0.01);
  }

  function playEat(){
    beep({ freq: 880, duration: 0.05, type: "square", gain: 0.05, slideTo: 1200 });
    // tiny click
    beep({ freq: 1760, duration: 0.02, type: "triangle", gain: 0.02 });
  }

  function playDie(){
    beep({ freq: 220, duration: 0.18, type: "sawtooth", gain: 0.06, slideTo: 60 });
    setTimeout(() => beep({ freq: 110, duration: 0.20, type: "square", gain: 0.05, slideTo: 40 }), 60);
  }

  return {
    ensureUnlocked,
    playEat,
    playDie,
    // sfx (keep legacy names used by UI)
    setEnabled: setSfxEnabled,
    isEnabled: isSfxEnabled,

    // music
    setMusicEnabled,
    isMusicEnabled,
    setMusicSrc,
    playMusic,
    stopMusic
  };
}

  ns.createAudio = createAudio;
})(window.SnakeArcade);


(function(ns){
  "use strict";
const KEY = "snake.theme";

function createTheme(){
  function get(){
    return document.documentElement.getAttribute("data-theme") || "dark";
  }

  function set(theme){
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);
  }

  function toggle(){
    const next = get() === "dark" ? "light" : "dark";
    set(next);
  }

  function applySaved(){
    const saved = localStorage.getItem(KEY);
    if(saved === "light" || saved === "dark"){
      set(saved);
    } else {
      // default: follow system preference
      const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
      set(prefersLight ? "light" : "dark");
    }
  }

  return { get, set, toggle, applySaved };
}

  ns.createTheme = createTheme;
})(window.SnakeArcade);


(function(ns){
  "use strict";
  const { clamp } = ns;

function createUI(els){
  const {
    scoreEl, bestEl,
    overlayEl, overlayTitleEl, overlayDescEl,
    btnRestart, btnSound, soundIcon,
    btnMusic, musicIcon,
    btnFullscreen, fsIcon,
    btnTheme
  } = els;

  let onRestartCb = null;
  let onThemeCb = null;
  let audio = null;

  function refreshMusicUI(){
    if(!audio || !btnMusic || !musicIcon) return;
    const on = audio.isMusicEnabled ? audio.isMusicEnabled() : false;
    musicIcon.textContent = on ? "♫" : "∅";
    btnMusic.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function refreshFullscreenUI(){
    if(!btnFullscreen || !fsIcon) return;
    const isFs = !!document.fullscreenElement;
    fsIcon.textContent = isFs ? "⤡" : "⤢";
    btnFullscreen.setAttribute("aria-pressed", isFs ? "true" : "false");
  }

  function setScore(score){
    scoreEl.textContent = String(score);
  }

  function setBest(best){
    bestEl.textContent = String(best);
  }

  function showOverlay(title, desc){
    overlayTitleEl.textContent = title;
    overlayDescEl.textContent = desc;
    overlayEl.style.opacity = "1";
    overlayEl.style.transform = "translateY(0)";
  }

  function hideOverlay(){
    overlayEl.style.opacity = "0";
    overlayEl.style.transform = "translateY(2px)";
  }

  function onRestart(cb){
    onRestartCb = cb;
  }

  function onThemeToggle(cb){
    onThemeCb = cb;
  }

  function bindAudio(a){
    audio = a;
    // initialize icon state
    refreshSoundUI();
    refreshMusicUI();
  }

  function refreshSoundUI(){
    if(!audio) return;
    const on = audio.isEnabled();
    soundIcon.textContent = on ? "♪" : "∅";
    btnSound.setAttribute("aria-pressed", on ? "true" : "false");
  }

  btnRestart.addEventListener("click", () => onRestartCb && onRestartCb());

  btnTheme.addEventListener("click", () => onThemeCb && onThemeCb());

  btnSound.addEventListener("click", () => {
    if(!audio) return;
    audio.ensureUnlocked();
    audio.setEnabled(!audio.isEnabled());
    refreshSoundUI();
    // haptic-ish feedback on mobile
    if(navigator.vibrate) navigator.vibrate(clamp(18, 10, 30));
  });

  if(btnMusic){
    btnMusic.addEventListener("click", () => {
      if(!audio) return;
      audio.ensureUnlocked();
      audio.setMusicEnabled(!audio.isMusicEnabled());
      refreshMusicUI();
      if(navigator.vibrate) navigator.vibrate(clamp(18, 10, 30));
    });
  }

  if(btnFullscreen){
    btnFullscreen.addEventListener("click", async () => {
      const target = document.querySelector(".app") || document.documentElement;
      if(!document.fullscreenEnabled && !target.requestFullscreen){
        return;
      }
      try {
        if(document.fullscreenElement){
          await document.exitFullscreen();
        } else {
          await target.requestFullscreen({ navigationUI: "hide" });
        }
      } catch {
        // ignore
      }
      refreshFullscreenUI();
    });
    document.addEventListener("fullscreenchange", refreshFullscreenUI);
    refreshFullscreenUI();
  }

  return {
    setScore,
    setBest,
    showOverlay,
    hideOverlay,
    onRestart,
    onThemeToggle,
    bindAudio,
    refreshSoundUI,
    refreshMusicUI,
    refreshFullscreenUI,
  };
}

  ns.createUI = createUI;
})(window.SnakeArcade);


(function(ns){
  "use strict";
  const { DIRS } = ns;

const KEYMAP = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up", W: "up",
  s: "down", S: "down",
  a: "left", A: "left",
  d: "right", D: "right",
};

function createInput({ element, canvas, onDirection, onInteract }){
  function send(dirKey){
    if(!DIRS[dirKey]) return;
    onInteract?.();
    onDirection?.(dirKey);
  }

  // Keyboard
  window.addEventListener("keydown", (e) => {
    const key = e.key;
    const dirKey = KEYMAP[key];
    if(!dirKey) return;
    e.preventDefault();
    send(dirKey);
  }, { passive: false });

  // D-Pad buttons
  const dpadBtns = document.querySelectorAll(".dpad__btn");
  dpadBtns.forEach(btn => {
    const dir = btn.getAttribute("data-dir");
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      send(dir);
    });
    // quicker on touch
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      send(dir);
    }, { passive: false });
  });

  // Swipe on canvas (optional; user allowed)
  let startX = 0, startY = 0, active = false;

  canvas.addEventListener("touchstart", (e) => {
    if(!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    active = true;
    onInteract?.();
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    if(!active || !e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // threshold tuned for "手感"
    const TH = 22;

    if(Math.abs(dx) < TH && Math.abs(dy) < TH) return;

    // lock to dominant axis
    if(Math.abs(dx) > Math.abs(dy)){
      send(dx > 0 ? "right" : "left");
    } else {
      send(dy > 0 ? "down" : "up");
    }
    active = false; // one swipe = one direction
  }, { passive: true });

  canvas.addEventListener("touchend", () => { active = false; }, { passive: true });
  canvas.addEventListener("touchcancel", () => { active = false; }, { passive: true });

  // Click anywhere to start / unlock audio (desktop)
  element.addEventListener("pointerdown", () => {
    onInteract?.();
  }, { passive: true });

  return { send };
}

  ns.createInput = createInput;
})(window.SnakeArcade);


(function(ns){
  "use strict";
  const { createInitialState, spawnFood, DIRS, saveBest } = ns;
  const { eqPos, oppositeDir, clamp, now } = ns;

function createGameEngine({ renderer, ui, audio }){
  let state = createInitialState();
  let rafId = null;
  let lastT = 0;
  let acc = 0;

  function computeTickMs(){
    // Accelerate with BOTH:
    // 1) score (reward)
    // 2) time/moves (pressure)
    const s = state.score;
    const steps = state.steps;

    const scoreAccel = Math.pow(s, 0.9) * 6;      // eat -> noticeable faster
    const timeAccel  = Math.pow(steps / 18, 0.85) * 3.2; // survive -> gradually faster

    return clamp(state.baseTickMs - scoreAccel - timeAccel, state.minTickMs, state.baseTickMs);
  }

  function setDirection(dirKey){
    if(!state.alive) return;
    if(!DIRS[dirKey]) return;

    // If not started, any direction starts the run
    if(!state.started){
      state.started = true;
      state.startedAt = now();
      startLoop();
    }

    const next = DIRS[dirKey];
    const cur = DIRS[state.dirKey];

    // No immediate reverse
    if(oppositeDir(next, cur)) return;

    state.nextDirKey = dirKey;
    ui.hideOverlay();
  }

  function ensureRunning(){
    if(state.started && !rafId && state.alive){
      startLoop();
    }
  }

  function startLoop(){
    cancelLoop();
    lastT = now();
    acc = 0;
    rafId = requestAnimationFrame(loop);
  }

  function cancelLoop(){
    if(rafId){
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function reset(){
    state = createInitialState();
    ui.setScore(state.score);
    ui.setBest(state.best);
  }

  function restart(){
    reset();
    draw();
    pause("READY?", "方向键/WASD 或 触屏方向键/滑动开始");
  }

  function pause(title, desc){
    cancelLoop();
    state.started = false;
    ui.showOverlay(title, desc);
  }

  function die(){
    state.alive = false;
    cancelLoop();
    audio?.playDie();
    ui.showOverlay("GAME OVER", "点击「重开」再来一局");
  }

  function step(){
    if(!state.alive) return;

    // Apply buffered direction
    state.dirKey = state.nextDirKey;

    const dir = DIRS[state.dirKey];
    const head = state.snake[0];
    const nextHead = { x: head.x + dir.x, y: head.y + dir.y };

    // Wall collision
    if(nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= state.grid || nextHead.y >= state.grid){
      die();
      return;
    }

    // Self collision (check vs current body)
    if(state.snake.some((seg, idx) => idx !== 0 && eqPos(seg, nextHead))){
      die();
      return;
    }

    // Move: add head
    state.snake.unshift(nextHead);
    state.steps += 1;

    // Eat?
    const ate = eqPos(nextHead, state.food);
    if(ate){
      state.score += 1;
      ui.setScore(state.score);
      audio?.playEat();

      if(state.score > state.best){
        state.best = state.score;
        saveBest(state.best);
        ui.setBest(state.best);
      }

      state.food = spawnFood(state.grid, state.snake);
    } else {
      // Remove tail if not eating
      state.snake.pop();
    }

    // Update speed
    state.tickMs = computeTickMs();
  }

  function loop(t){
    const dt = t - lastT;
    lastT = t;
    acc += dt;

    // While loop to avoid slow device drift
    const tick = state.tickMs || state.baseTickMs;
    const maxSteps = 3; // safety
    let steps = 0;

    while(acc >= tick && steps < maxSteps){
      step();
      acc -= tick;
      steps++;
    }

    draw();

    if(state.alive && state.started){
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
    }
  }

  function draw(){
    renderer.render(state);
  }

  return {
    reset,
    restart,
    pause,
    draw,
    setDirection,
    ensureRunning,
    getState: () => state,
  };
}

  ns.createGameEngine = createGameEngine;
})(window.SnakeArcade);


(function(){
  "use strict";
  const {
    createGameEngine,
    createRenderer,
    createInput,
    createAudio,
    createUI,
    createTheme,
  } = window.SnakeArcade;

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");

const ui = createUI({
  scoreEl: document.getElementById("score"),
  bestEl: document.getElementById("best"),
  overlayEl: overlay,
  overlayTitleEl: document.getElementById("overlayTitle"),
  overlayDescEl: document.getElementById("overlayDesc"),
  btnRestart: document.getElementById("btnRestart"),
  btnSound: document.getElementById("btnSound"),
  soundIcon: document.getElementById("soundIcon"),
  btnMusic: document.getElementById("btnMusic"),
  musicIcon: document.getElementById("musicIcon"),
  btnFullscreen: document.getElementById("btnFullscreen"),
  fsIcon: document.getElementById("fsIcon"),
  btnTheme: document.getElementById("btnTheme"),
});

function fitBoard(){
  const app = document.querySelector(".app");
  const stage = document.querySelector(".stage");
  const boardWrap = document.querySelector(".board-wrap");
  const topbar = document.querySelector(".topbar");
  const controls = document.querySelector(".controls");
  const footer = document.querySelector(".footer");
  const isDesktop = window.matchMedia("(min-width: 860px)").matches;

  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const appStyle = app ? getComputedStyle(app) : null;
  const padT = appStyle ? parseFloat(appStyle.paddingTop) || 0 : 0;
  const padB = appStyle ? parseFloat(appStyle.paddingBottom) || 0 : 0;
  const padL = appStyle ? parseFloat(appStyle.paddingLeft) || 0 : 0;
  const padR = appStyle ? parseFloat(appStyle.paddingRight) || 0 : 0;
  const appGap = appStyle ? parseFloat(appStyle.gap) || 0 : 0;

  const stageGap = stage ? (parseFloat(getComputedStyle(stage).gap) || 0) : 0;

  const topH = topbar ? topbar.getBoundingClientRect().height : 0;
  const footH = footer ? footer.getBoundingClientRect().height : 0;
  const controlsH = (!isDesktop && controls) ? controls.getBoundingClientRect().height : 0;

  const bwStyle = boardWrap ? getComputedStyle(boardWrap) : null;
  const bwPad = bwStyle ? (parseFloat(bwStyle.paddingTop) || 0) : 0;
  const bwBorder = bwStyle ? (parseFloat(bwStyle.borderTopWidth) || 0) : 0;
  const boardExtra = (bwPad + bwBorder) * 2;

  // Vertical budget: header + footer + app padding + gaps + (controls on mobile)
  const chromeH = topH + footH + padT + padB + (appGap * 2) + (isDesktop ? 0 : (controlsH + stageGap));
  const availCanvasH = Math.max(220, vh - chromeH - boardExtra);

  // Horizontal budget: app padding + (side panel on desktop)
  const sideW = (isDesktop && controls) ? controls.getBoundingClientRect().width : 0;
  const chromeW = padL + padR + (isDesktop ? (sideW + stageGap) : 0);
  const availCanvasW = Math.max(220, vw - chromeW - boardExtra);

  // Cap to keep pixels readable and avoid giant boards on desktop
  const size = Math.floor(Math.min(availCanvasH, availCanvasW, 720));
  document.documentElement.style.setProperty("--boardSize", `${size}px`);
}

window.addEventListener("resize", fitBoard, { passive: true });
window.addEventListener("orientationchange", fitBoard, { passive: true });
document.addEventListener("fullscreenchange", () => setTimeout(fitBoard, 60));
fitBoard();

const theme = createTheme();
theme.applySaved();

const audio = createAudio();
ui.bindAudio(audio);

const renderer = createRenderer(canvas);
const engine = createGameEngine({ renderer, ui, audio });

const input = createInput({
  element: document.body,
  canvas,
  onDirection: (dir) => engine.setDirection(dir),
  onInteract: () => {
    audio.ensureUnlocked();
    engine.ensureRunning();
  },
});

ui.onRestart(() => {
  audio.ensureUnlocked();
  engine.restart();
});

ui.onThemeToggle(() => theme.toggle());

// First paint
engine.reset();
engine.draw();

// Let the engine render a subtle attract mode (overlay visible until first move)
engine.pause("READY?", "方向键/WASD 或 触屏方向键/滑动开始");
})();
