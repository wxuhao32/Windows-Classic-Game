/**
 * GameCanvas (v5)
 * - Smooth multiplayer: snapshot interpolation + lightweight prediction for local player
 * - Big perf win: draw snakes as stroked paths (NOT per-segment arcs)
 */

import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import type { FoodParticle, GameState, Snake, Vec2 } from "@/lib/gameEngine";
import { BASE_SPEED, MAX_TURN_RATE } from "@/lib/gameEngine";

type Stick = { x: number; y: number };

type Props = {
  gameState: GameState;
  mySnakeId?: string | null;
  myStickRef?: MutableRefObject<Stick>;
  fullscreen?: boolean;
};

const BG_URL = "/background/1.png";

let bgImg: HTMLImageElement | null = null;
let bgReady = false;
let bgFailed = false;

function ensureBackgroundLoaded() {
  if (bgImg || bgFailed) return;
  const img = new Image();
  img.onload = () => {
    bgImg = img;
    bgReady = true;
  };
  img.onerror = () => {
    bgFailed = true;
  };
  img.src = BG_URL;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function rgba(hex: string, a: number) {
  // supports #RRGGBB
  if (!hex.startsWith("#") || hex.length !== 7) return `rgba(255,255,255,${a})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function getMySnake(state: GameState, mySnakeId: string | null | undefined) {
  // If mySnakeId is set but points to a dead/empty/missing snake (e.g. after death/respawn/slot switch),
  // don't early-return null; fall back to other heuristics so the camera keeps following the player.
  const byId =
    mySnakeId
      ? state.snakes.find((x) => x.id === mySnakeId && x.isAlive && (x.body?.length ?? 0) > 0) || null
      : null;
  if (byId) return byId;

  const byControlled = state.snakes.find((x) => !!x.controlledBy && x.isAlive && (x.body?.length ?? 0) > 0) || null;
  if (byControlled) return byControlled;

  const byPlayerFlag = state.snakes.find((x) => x.isPlayer && x.isAlive && (x.body?.length ?? 0) > 0) || null;
  if (byPlayerFlag) return byPlayerFlag;

  const anyAlive = state.snakes.find((x) => x.isAlive && (x.body?.length ?? 0) > 0) || null;
  if (anyAlive) return anyAlive;

  // Last resort: any snake with a body
  const anyBody = state.snakes.find((x) => (x.body?.length ?? 0) > 0) || null;
  return anyBody;
}

type Snap = { state: GameState; t: number };

function interpSnake(a: Snake, b: Snake, t: number): Snake {
  const aBody = a.body;
  const bBody = b.body;
  const n = Math.min(aBody.length, bBody.length);
  const body: Vec2[] = [];
  for (let i = 0; i < n; i++) body.push(lerpVec(aBody[i], bBody[i], t));
  if (bBody.length > n) {
    for (let i = n; i < bBody.length; i++) body.push(bBody[i]);
  }
  return { ...b, body, angle: lerp(a.angle, b.angle, t) };
}

function buildRenderState(a: GameState, b: GameState, t: number): GameState {
  const aMap = new Map(a.snakes.map((s) => [s.id, s]));
  const snakes = b.snakes.map((sb) => {
    const sa = aMap.get(sb.id);
    return sa ? interpSnake(sa, sb, t) : sb;
  });

  // food can be interpolated only by position if ids match (optional). keep b for simplicity.
  return { ...b, snakes };
}

// Very small local prediction for local snake (render-only)
function predictLocal(state: GameState, mySnakeId: string, stick: Stick | null, dtMs: number): GameState {
  if (!stick) return state;
  const s = state.snakes.find((x) => x.id === mySnakeId);
  if (!s || !s.isAlive) return state;

  const dead = 0.06;
  const mag = Math.hypot(stick.x, stick.y);
  if (mag < dead) return state;

  const strength = clamp((mag - dead) / (1 - dead), 0, 1);
  const curved = Math.pow(strength, 0.55);

  const dirX = stick.x / (mag || 1);
  const dirY = stick.y / (mag || 1);
  const targetAngle = Math.atan2(dirY, dirX);

  // rotate quickly (same-ish as server)
  const maxDelta = MAX_TURN_RATE * (dtMs / 1000) * (0.30 + 0.70 * curved);
  // wrap to [-pi,pi)
  const wrap = (a: number) => {
    while (a >= Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  const rotateTowards = (current: number, target: number, md: number) => {
    let delta = wrap(target - current);
    delta = clamp(delta, -md, md);
    return wrap(current + delta);
  };

  const nextAngle = rotateTowards(s.angle, targetAngle, maxDelta);

  // advance forward a bit
  const dx = Math.cos(nextAngle) * BASE_SPEED * (dtMs / 1000);
  const dy = Math.sin(nextAngle) * BASE_SPEED * (dtMs / 1000);

  const body = s.body.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const nextSnake = { ...s, body, angle: nextAngle };

  return {
    ...state,
    snakes: state.snakes.map((x) => (x.id === mySnakeId ? nextSnake : x)),
  };
}

function drawBackground(ctx: CanvasRenderingContext2D, state: GameState, cam: { x: number; y: number; scale: number }, w: number, h: number) {
  if (bgReady && bgImg) {
    // parallax background
    const img = bgImg;
    const scale = 1.15;
    const x = -((cam.x * 0.06) % img.width);
    const y = -((cam.y * 0.06) % img.height);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    for (let ix = -1; ix <= 2; ix++) {
      for (let iy = -1; iy <= 2; iy++) {
        ctx.drawImage(img, ix * img.width, iy * img.height);
      }
    }
    ctx.restore();
  } else {
    // fallback grid
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "rgba(0,255,255,0.15)";
    const step = 80;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFood(ctx: CanvasRenderingContext2D, food: FoodParticle[], tMs: number) {
  for (const f of food) {
    const born = typeof (f as any).createdAt === "number" ? (f as any).createdAt : tMs;
    const pulse = 0.85 + 0.15 * Math.sin((tMs - born) * 0.006);
    const r = Math.max(1, (f.radius || 4) * pulse);

    ctx.save();
    ctx.fillStyle = rgba((f as any).color || "#00ffff", 0.9);
    ctx.shadowColor = rgba((f as any).color || "#00ffff", 0.5);
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(f.position.x, f.position.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawSnake(ctx: CanvasRenderingContext2D, s: Snake) {
  const body = s.body;
  if (body.length < 2) return;

  // thick path
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // outer glow
  ctx.strokeStyle = rgba(s.color, 0.65);
  ctx.lineWidth = s.radius * 2.25;
  ctx.shadowColor = rgba(s.color, 0.35);
  ctx.shadowBlur = 18;

  ctx.beginPath();
  ctx.moveTo(body[body.length - 1].x, body[body.length - 1].y);
  for (let i = body.length - 2; i >= 0; i--) {
    const p = body[i];
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // inner core
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba("#ffffff", 0.12);
  ctx.lineWidth = s.radius * 1.2;
  ctx.stroke();

  // head
  const head = body[0];
  ctx.fillStyle = rgba(s.color, 0.95);
  ctx.shadowColor = rgba(s.color, 0.6);
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(head.x, head.y, s.radius * 1.15, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const ex = Math.cos(s.angle) * (s.radius * 0.45);
  const ey = Math.sin(s.angle) * (s.radius * 0.45);
  const nx = -Math.sin(s.angle) * (s.radius * 0.35);
  const ny = Math.cos(s.angle) * (s.radius * 0.35);
  ctx.beginPath();
  ctx.arc(head.x + ex + nx, head.y + ey + ny, s.radius * 0.18, 0, Math.PI * 2);
  ctx.arc(head.x + ex - nx, head.y + ey - ny, s.radius * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function GameCanvas({ gameState, mySnakeId, myStickRef, fullscreen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const aRef = useRef<Snap | null>(null);
  const bRef = useRef<Snap | null>(null);

  const camRef = useRef({ x: 0, y: 0, scale: 1, init: false });

  const setSnap = (s: GameState) => {
    const now = Date.now();
    if (!aRef.current) {
      aRef.current = { state: s, t: now };
      bRef.current = { state: s, t: now };
      return;
    }
    aRef.current = bRef.current;
    bRef.current = { state: s, t: now };
  };

  // update snapshot whenever prop changes (by reference)
  useEffect(() => {
    setSnap(gameState);
  }, [gameState]);

  // preload bg
  useEffect(() => {
    ensureBackgroundLoaded();
  }, []);

  // This canvas is always hosted inside a sized container (the playfield).
  // Let the container control the layout to avoid "canvas height != container height" issues.
  const style = useMemo(() => {
    const base: React.CSSProperties = {
      width: "100%",
      height: "100%",
      display: "block",
      border: "none",
      borderRadius: fullscreen ? 0 : 18,
      background: "rgba(0,0,0,0.10)",
    };
    return base;
  }, [fullscreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let lastT = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const INTERP_DELAY = 85; // ms

    const loop = (t: number) => {
      const dt = t - lastT;
      lastT = t;

      const a = aRef.current;
      const b = bRef.current;
      let renderState = gameState;

      if (a && b && b.t !== a.t) {
        const rt = Date.now() - INTERP_DELAY;
        const alpha = clamp((rt - a.t) / (b.t - a.t), 0, 1);
        renderState = buildRenderState(a.state, b.state, alpha);

        // tiny local prediction using time since last snapshot
        const lag = clamp(Date.now() - b.t, 0, 80);
        if (mySnakeId && myStickRef?.current) {
          renderState = predictLocal(renderState, mySnakeId, myStickRef.current, lag);
        }
      }

      const w = Math.max(1, Math.floor(canvas.clientWidth));
      const h = Math.max(1, Math.floor(canvas.clientHeight));
      const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);
      const needW = Math.floor(w * dpr);
      const needH = Math.floor(h * dpr);
      if (canvas.width !== needW || canvas.height !== needH) {
        canvas.width = needW;
        canvas.height = needH;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Camera follow
      const me = getMySnake(renderState, mySnakeId);
      const focus = me?.body[0] || { x: renderState.worldWidth / 2, y: renderState.worldHeight / 2 };
      const len = me?.length || 220;
      const targetScale = clamp(1 / (1 + len / 950), 0.34, 1.0);

            const cam = camRef.current;
      // Snap camera on first frame (or after a long drift), so the player never starts off-screen.
      const dx0 = focus.x - cam.x;
      const dy0 = focus.y - cam.y;
      const dist2 = dx0 * dx0 + dy0 * dy0;
      const tooFar = dist2 > 1600 * 1600; // 1600px world distance threshold

      if (!cam.init || tooFar) {
        cam.x = focus.x;
        cam.y = focus.y;
        cam.scale = targetScale;
        cam.init = true;
      } else {
        const followK = 1 - Math.pow(0.001, dt / 16.67);
        cam.x = lerp(cam.x, focus.x, followK);
        cam.y = lerp(cam.y, focus.y, followK);
        cam.scale = lerp(cam.scale, targetScale, followK);
      }
      // World -> screen (camera)
      // IMPORTANT: do NOT subtract cam twice.
      // Correct transform: screen = center + scale * (world - cam)
      ctx.save();
      const originX = Math.round((w / 2) * dpr) / dpr;
      const originY = Math.round((h / 2) * dpr) / dpr;
      ctx.translate(originX, originY);
      ctx.scale(cam.scale, cam.scale);
      ctx.translate(-cam.x, -cam.y);

      // background in world coordinates (simple)
      drawBackground(ctx, renderState, cam, w, h);

      // bounds (subtle)
      ctx.save();
      ctx.strokeStyle = "rgba(0,255,255,0.18)";
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, renderState.worldWidth, renderState.worldHeight);
      ctx.restore();

      // food
      drawFood(ctx, renderState.food, Date.now());

      // snakes (draw others first)
      const snakes = renderState.snakes.slice().sort((x, y) => {
        if (mySnakeId && x.id === mySnakeId) return 1;
        if (mySnakeId && y.id === mySnakeId) return -1;
        return 0;
      });
      for (const s of snakes) {
        if (!s.isAlive) continue;
        drawSnake(ctx, s);
      }

      ctx.restore();

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [gameState, mySnakeId, myStickRef]);

  return <canvas ref={canvasRef} style={style} />;
}
