/**
 * GameCanvas
 * - Renders a large world with camera follow + dynamic zoom (length-based).
 * - Uses requestAnimationFrame for smooth visuals.
 *
 * ✅ v4 Smoothness update:
 * - Interpolate between last 2 network snapshots (adds ~1 snapshot of visual latency but removes stutter).
 * - Light extrapolation when snapshots are late (reduces "turn feels delayed").
 * - Defensive drawing for food.createdAt to avoid white-screen crashes.
 */

import { useEffect, useRef } from "react";
import type { FoodParticle, GameState, Snake, Vec2 } from "@/lib/gameEngine";

type Props = {
  gameState: GameState;
  mySnakeId?: string | null;
};

const BG_URL = "/background/1.png";

let bgImg: HTMLImageElement | null = null;
let bgReady = false;
let bgFailed = false;

function ensureBackgroundLoaded() {
  if (bgImg || bgFailed) return;
  const img = new Image();
  img.decoding = "async";
  img.src = BG_URL;
  img.onload = () => {
    bgReady = true;
  };
  img.onerror = () => {
    bgFailed = true;
  };
  bgImg = img;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function wrapAngle(a: number) {
  while (a >= Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function rotateTowards(cur: number, target: number, maxDelta: number) {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  const n = parseInt(h, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function lighten(hex: string, t: number) {
  const { r, g, b } = hexToRgb(hex);
  const rr = Math.round(r + (255 - r) * t);
  const gg = Math.round(g + (255 - g) * t);
  const bb = Math.round(b + (255 - b) * t);
  return `rgb(${rr},${gg},${bb})`;
}

export function GameCanvas({ gameState, mySnakeId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Snapshot interpolation
  const currStateRef = useRef<GameState>(gameState);
  const prevStateRef = useRef<GameState | null>(null);
  const prevSnakesRef = useRef<Map<string, Snake>>(new Map());
  const prevFoodRef = useRef<Map<string, FoodParticle>>(new Map());

  const lastSnapshotAtRef = useRef<number>(performance.now());
  const snapshotIntervalRef = useRef<number>(50);

  // Smooth camera state
  const camRef = useRef({
    x: gameState.worldWidth / 2,
    y: gameState.worldHeight / 2,
    scale: 1,
    shakeT: 0,
    shakePow: 0,
  });

  useEffect(() => {
    ensureBackgroundLoaded();
  }, []);

  // Update snapshot refs when prop changes
  useEffect(() => {
    const now = performance.now();
    const prev = currStateRef.current;
    prevStateRef.current = prev;
    prevSnakesRef.current = new Map(prev.snakes.map((s) => [s.id, s]));
    prevFoodRef.current = new Map(prev.food.map((f) => [f.id, f]));

    currStateRef.current = gameState;

    const interval = Math.max(16, now - lastSnapshotAtRef.current);
    snapshotIntervalRef.current = clamp(interval, 30, 120); // keep stable
    lastSnapshotAtRef.current = now;
  }, [gameState]);

  // rAF render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      const prev = prevStateRef.current || currStateRef.current;
      const curr = currStateRef.current;

      const intervalMs = snapshotIntervalRef.current;
      const elapsedMs = t - lastSnapshotAtRef.current;

      // We render the previous snapshot at alpha=0 and slide to current over ~one interval.
      const alphaRaw = elapsedMs / intervalMs;
      const alpha = clamp(alphaRaw, 0, 1);

      // If snapshots arrive late, extrapolate a tiny bit from current to reduce "freeze"
      const extraMs = Math.max(0, elapsedMs - intervalMs);
      const extraSec = clamp(extraMs / 1000, 0, 0.09);

      draw(ctx, canvas, prev, curr, alpha, extraSec, mySnakeId, camRef.current, dt, t, prevSnakesRef.current, prevFoodRef.current);

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [mySnakeId]);

  const { viewWidth, viewHeight } = gameState;

  return (
    <canvas
      ref={canvasRef}
      width={viewWidth}
      height={viewHeight}
      className="border-2 border-white/15 rounded-2xl shadow-lg w-full h-auto max-w-[980px]"
      style={{
        aspectRatio: `${viewWidth} / ${viewHeight}`,
        boxShadow: "0 0 18px rgba(0, 255, 136, 0.12)",
        touchAction: "none",
      }}
    />
  );
}

function getMySnake(state: GameState, mySnakeId?: string | null): Snake | null {
  if (mySnakeId) {
    const s = state.snakes.find((x) => x.id === mySnakeId);
    if (s) return s;
  }
  const p = state.snakes.find((x) => x.isPlayer && x.isAlive);
  return p || null;
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  prev: GameState,
  curr: GameState,
  alpha: number,
  extraSec: number,
  mySnakeId: string | null | undefined,
  cam: { x: number; y: number; scale: number; shakeT: number; shakePow: number },
  dt: number,
  t: number,
  prevSnakes: Map<string, Snake>,
  prevFood: Map<string, FoodParticle>
) {
  const w = canvas.width;
  const h = canvas.height;

  const meCurr = getMySnake(curr, mySnakeId);
  const mePrev = meCurr ? prevSnakes.get(meCurr.id) : null;

  const focusBase = meCurr?.body?.[0] || { x: curr.worldWidth / 2, y: curr.worldHeight / 2 };
  const focusPrev = mePrev?.body?.[0] || focusBase;

  // Interpolated focus
  let focus = lerpVec(focusPrev, focusBase, alpha);

  // Tiny extrapolation to reduce "waiting for next snapshot" feel
  if (meCurr && extraSec > 0) {
    const speed = meCurr.speed || 170;
    let ang = meCurr.angle || 0;
    const target = (meCurr.targetAngle ?? ang) as number;
    const strength = clamp(meCurr.steerStrength ?? 0, 0, 1);
    const maxTurn = Math.PI * 3.0 * extraSec * (0.30 + 0.70 * strength);
    ang = rotateTowards(ang, target, maxTurn);

    focus = {
      x: focus.x + Math.cos(ang) * speed * extraSec,
      y: focus.y + Math.sin(ang) * speed * extraSec,
    };
  }

  // Zoom out as we get longer (keep threats visible)
  const len = meCurr?.length || 220;
  const targetScale = clamp(1 / (1 + len / 900), 0.32, 1.0);

  // Exponential smoothing
  const followK = 1 - Math.pow(0.001, dt);
  cam.x += (focus.x - cam.x) * followK;
  cam.y += (focus.y - cam.y) * followK;
  cam.scale += (targetScale - cam.scale) * followK;

  // Screen shake (based on deaths between prev->curr)
  if (meCurr && prev) {
    const prevAlive = new Map(prev.snakes.map((s) => [s.id, s.isAlive]));
    for (const s of curr.snakes) {
      if (prevAlive.get(s.id) === true && s.isAlive === false) {
        const headA = focusBase;
        const headB = s.body[0] || headA;
        const d = dist(headA, headB);
        const near = d < 650;
        const isMe = s.id === meCurr.id;
        if (near || isMe) {
          cam.shakeT = isMe ? 0.35 : 0.2;
          cam.shakePow = isMe ? 10 : 6;
        }
      }
    }
  }

  cam.shakeT = Math.max(0, cam.shakeT - dt);
  const shake = cam.shakeT > 0 ? cam.shakePow * (cam.shakeT / 0.35) : 0;
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;

  // Clear
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Background image (cover)
  if (bgReady && bgImg) {
    drawBackgroundCover(ctx, bgImg, w, h);
    ctx.fillStyle = "rgba(10, 14, 20, 0.35)";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#0f1419";
    ctx.fillRect(0, 0, w, h);
  }

  // Camera transform: world -> screen
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x + sx / cam.scale, -cam.y + sy / cam.scale);

  // Parallax grid
  drawSoftGrid(ctx, curr, t);

  // World bounds
  drawBounds(ctx, curr);

  // Food (interpolated)
  for (const f of curr.food) {
    const pf = prevFood.get(f.id);
    const pos = pf ? lerpVec(pf.position, f.position, alpha) : f.position;
    drawFood(ctx, { ...f, position: pos } as any, t);
  }

  // Snakes (tail -> head), interpolated + light extrapolation when late
  for (const s of curr.snakes) {
    if (!s.isAlive) continue;
    const ps = prevSnakes.get(s.id);
    drawSnakeInterpolated(ctx, s, ps, alpha, extraSec, t);
  }

  // HUD in world coords: player name above head
  if (meCurr && meCurr.isAlive) {
    const head = focus;
    ctx.font = "bold 18px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const label = meCurr.playerName || (meCurr.id === "player" ? "玩家" : meCurr.id);
    ctx.fillText(label, head.x, head.y - meCurr.radius - 10);
  }

  ctx.restore();

  // Pause overlay
  if (curr.isPaused) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,255,200,0.95)";
    ctx.font = "900 44px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("暂停", w / 2, h / 2);
  }
}

function drawBackgroundCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawSoftGrid(ctx: CanvasRenderingContext2D, state: GameState, t: number) {
  const step = 120;
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;

  for (let x = 0; x <= state.worldWidth; x += step) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.001 + x * 0.002);
    ctx.strokeStyle = `rgba(0,255,200,${0.04 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.worldHeight);
    ctx.stroke();
  }

  for (let y = 0; y <= state.worldHeight; y += step) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 0.001 + y * 0.002);
    ctx.strokeStyle = `rgba(255,0,255,${0.03 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.worldWidth, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBounds(ctx: CanvasRenderingContext2D, state: GameState) {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.strokeRect(0, 0, state.worldWidth, state.worldHeight);
  ctx.restore();
}

function drawFood(ctx: CanvasRenderingContext2D, f: FoodParticle, t: number) {
  const createdAt = (f as any).createdAt ?? t; // defensive: avoid NaN -> white-screen
  const pulse = 0.75 + 0.25 * Math.sin((t - createdAt) * 0.006);
  const r = f.radius * pulse;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = rgba(f.color, 0.6);
  ctx.shadowBlur = 14;

  const grad = ctx.createRadialGradient(f.position.x - r * 0.3, f.position.y - r * 0.3, r * 0.2, f.position.x, f.position.y, r * 2.2);
  const hot = lighten(f.color, f.kind === "loot" ? 0.55 : 0.35);
  grad.addColorStop(0, rgba(hot, 0.95));
  grad.addColorStop(0.45, rgba(f.color, 0.75));
  grad.addColorStop(1, rgba(f.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(f.position.x, f.position.y, r * 2.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(hot, 0.9);
  ctx.beginPath();
  ctx.arc(f.position.x, f.position.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSnakeInterpolated(ctx: CanvasRenderingContext2D, s: Snake, ps: Snake | undefined, alpha: number, extraSec: number, t: number) {
  const body = s.body;
  const n = body.length;

  // Predict head shift when snapshots are late (small, helps responsiveness)
  let shiftX = 0;
  let shiftY = 0;
  if (extraSec > 0) {
    const speed = s.speed || 170;
    let ang = s.angle || 0;
    const target = (s.targetAngle ?? ang) as number;
    const strength = clamp(s.steerStrength ?? 0, 0, 1);
    const maxTurn = Math.PI * 3.0 * extraSec * (0.30 + 0.70 * strength);
    ang = rotateTowards(ang, target, maxTurn);
    shiftX = Math.cos(ang) * speed * extraSec;
    shiftY = Math.sin(ang) * speed * extraSec;
  }

  // Draw from tail to head so head stays on top
  for (let i = n - 1; i >= 0; i--) {
    const p = body[i];
    const pp = ps?.body?.[Math.min(i, (ps.body?.length || 1) - 1)] || p;
    const ip = lerpVec(pp, p, alpha);

    const headness = 1 - i / Math.max(1, n - 1); // 1 at head
    const baseR = s.radius * (0.65 + 0.35 * headness);

    // Apply head-weighted shift (keeps tail steadier)
    const w = 0.15 + 0.85 * headness;
    const x0 = ip.x + shiftX * w;
    const y0 = ip.y + shiftY * w;

    // wavy motion (subtle)
    const phase = t * 0.003 + i * 0.42;
    const amp = s.radius * 0.35 * headness;
    const dir = getTangent(body, i);
    const nx = -dir.y;
    const ny = dir.x;
    const wx = nx * Math.sin(phase) * amp;
    const wy = ny * Math.sin(phase) * amp;
    const x = x0 + wx;
    const y = y0 + wy;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = rgba(s.color, 0.35 + 0.35 * headness);
    ctx.shadowBlur = 16;

    const hot = lighten(s.color, 0.18 + 0.42 * headness);
    const grad = ctx.createRadialGradient(x - baseR * 0.35, y - baseR * 0.35, baseR * 0.2, x, y, baseR * 1.55);
    grad.addColorStop(0, rgba(hot, 0.95));
    grad.addColorStop(0.5, rgba(s.color, 0.85));
    grad.addColorStop(1, rgba(s.color, 0.15));
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.arc(x, y, baseR, 0, Math.PI * 2);
    ctx.fill();

    // inner core
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = rgba(hot, 0.6 + 0.25 * headness);
    ctx.beginPath();
    ctx.arc(x, y, baseR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Eyes on head
  const head = body[0];
  const pHead = ps?.body?.[0] || head;
  const ih = lerpVec(pHead, head, alpha);
  const headnessShiftX = shiftX * 1.0;
  const headnessShiftY = shiftY * 1.0;
  drawEyes(ctx, { x: ih.x + headnessShiftX, y: ih.y + headnessShiftY }, s, t);
}

function getTangent(body: Vec2[], i: number) {
  const a = body[Math.max(0, i - 1)];
  const b = body[Math.min(body.length - 1, i + 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

function drawEyes(ctx: CanvasRenderingContext2D, head: Vec2, s: Snake, t: number) {
  // Use snake angle for eye direction if present
  const ang = s.angle ?? 0;
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);

  const ex = -fy;
  const ey = fx;

  const eyeOffset = s.radius * 0.35;
  const eyeR = s.radius * 0.28;

  const left = { x: head.x + ex * eyeOffset, y: head.y + ey * eyeOffset };
  const right = { x: head.x - ex * eyeOffset, y: head.y - ey * eyeOffset };

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // sclera
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(left.x, left.y, eyeR, 0, Math.PI * 2);
  ctx.arc(right.x, right.y, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // pupil wiggle
  const wig = 0.55 + 0.45 * Math.sin(t * 0.004);
  const px = fx * eyeR * 0.4 * wig;
  const py = fy * eyeR * 0.4 * wig;

  ctx.fillStyle = "rgba(0,0,0,0.9)";
  ctx.beginPath();
  ctx.arc(left.x + px, left.y + py, eyeR * 0.45, 0, Math.PI * 2);
  ctx.arc(right.x + px, right.y + py, eyeR * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
