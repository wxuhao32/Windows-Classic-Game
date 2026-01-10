/**
 * GameCanvas
 * - Renders a large world with camera follow + dynamic zoom (length-based).
 * - Uses requestAnimationFrame for smooth visuals (state may update at 20Hz).
 */

import { useEffect, useMemo, useRef } from "react";
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
  const stateRef = useRef<GameState>(gameState);
  const prevStateRef = useRef<GameState | null>(null);

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

  // Keep latest state in a ref so rAF can render smoothly.
  useEffect(() => {
    // Detect deaths for screen shake
    const prev = prevStateRef.current;
    const next = gameState;

    const me = getMySnake(next, mySnakeId);
    if (prev && me) {
      const prevAlive = new Map(prev.snakes.map((s) => [s.id, s.isAlive]));
      for (const s of next.snakes) {
        if (prevAlive.get(s.id) === true && s.isAlive === false) {
          const d = dist(me.body[0], s.body[0] || me.body[0]);
          const near = d < 650;
          const isMe = s.id === me.id;
          if (near || isMe) {
            camRef.current.shakeT = isMe ? 0.35 : 0.2;
            camRef.current.shakePow = isMe ? 10 : 6;
          }
        }
      }
    }

    prevStateRef.current = next;
    stateRef.current = next;
  }, [gameState, mySnakeId]);

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
      draw(ctx, canvas, stateRef.current, mySnakeId, camRef.current, dt, t);
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
  state: GameState,
  mySnakeId: string | null | undefined,
  cam: { x: number; y: number; scale: number; shakeT: number; shakePow: number },
  dt: number,
  t: number
) {
  const w = canvas.width;
  const h = canvas.height;

  const me = getMySnake(state, mySnakeId);
  const focus = me?.body[0] || { x: state.worldWidth / 2, y: state.worldHeight / 2 };

  // Zoom out as we get longer (keep threats visible)
  const len = me?.length || 220;
  const targetScale = clamp(1 / (1 + len / 900), 0.32, 1.0);

  // Exponential smoothing
  const followK = 1 - Math.pow(0.001, dt);
  cam.x += (focus.x - cam.x) * followK;
  cam.y += (focus.y - cam.y) * followK;
  cam.scale += (targetScale - cam.scale) * followK;

  // Screen shake
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
    // Slight dark tint so neon elements remain readable
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
  drawSoftGrid(ctx, state, t);

  // World bounds
  drawBounds(ctx, state);

  // Food
  for (const f of state.food) drawFood(ctx, f, t);

  // Snakes (tail -> head)
  for (const s of state.snakes) {
    if (!s.isAlive) continue;
    drawSnake(ctx, s, t);
  }

  // HUD in world coords: player name above head
  if (me && me.isAlive) {
    const head = me.body[0];
    ctx.font = "bold 18px Orbitron, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const label = me.playerName || (me.id === "player" ? "玩家" : me.id);
    ctx.fillText(label, head.x, head.y - me.radius - 10);
  }

  ctx.restore();

  // Pause overlay
  if (state.isPaused) {
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
  const step = 140;
  const alpha = 0.08;
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(180,220,255,${alpha})`;
  // Offset the grid slowly for liveliness
  const ox = Math.sin(t * 0.0004) * 8;
  const oy = Math.cos(t * 0.0003) * 8;
  const x0 = -ox;
  const y0 = -oy;

  for (let x = x0; x <= state.worldWidth; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, state.worldHeight);
    ctx.stroke();
  }
  for (let y = y0; y <= state.worldHeight; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(state.worldWidth, y);
    ctx.stroke();
  }
}

function drawBounds(ctx: CanvasRenderingContext2D, state: GameState) {
  ctx.save();
  ctx.lineWidth = 18;
  ctx.strokeStyle = "rgba(0,255,136,0.07)";
  ctx.strokeRect(0, 0, state.worldWidth, state.worldHeight);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.strokeRect(0, 0, state.worldWidth, state.worldHeight);
  ctx.restore();
}

function drawFood(ctx: CanvasRenderingContext2D, f: FoodParticle, t: number) {
  const pulse = 0.75 + 0.25 * Math.sin((t - f.createdAt) * 0.006);
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

function drawSnake(ctx: CanvasRenderingContext2D, s: Snake, t: number) {
  const body = s.body;
  const n = body.length;

  // Draw from tail to head so head stays on top
  for (let i = n - 1; i >= 0; i--) {
    const p = body[i];
    const headness = 1 - i / Math.max(1, n - 1); // 1 at head
    const baseR = s.radius * (0.65 + 0.35 * headness);

    // wavy motion (subtle)
    const phase = t * 0.003 + i * 0.42;
    const amp = s.radius * 0.35 * headness;
    const dir = getTangent(body, i);
    const nx = -dir.y;
    const ny = dir.x;
    const wx = nx * Math.sin(phase) * amp;
    const wy = ny * Math.sin(phase) * amp;
    const x = p.x + wx;
    const y = p.y + wy;

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

    // glossy highlight
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba("#ffffff", 0.14 + 0.22 * headness);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x - baseR * 0.15, y - baseR * 0.18, baseR * 0.78, -Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  // Head details (eyes)
  const head = body[0];
  const dir = getTangent(body, 0);
  const ang = Math.atan2(dir.y, dir.x);
  drawEyes(ctx, head.x, head.y, s.radius, ang);
}

function getTangent(body: Vec2[], i: number): Vec2 {
  const p = body[i];
  const a = body[Math.min(body.length - 1, i + 1)];
  const b = body[Math.max(0, i - 1)];
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const l = Math.hypot(tx, ty) || 1;
  return { x: tx / l, y: ty / l };
}

function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number) {
  const ex = Math.cos(ang);
  const ey = Math.sin(ang);
  const nx = -ey;
  const ny = ex;

  const eyeSep = r * 0.55;
  const eyeFwd = r * 0.45;
  const er = r * 0.33;

  const lx = x + ex * eyeFwd + nx * eyeSep;
  const ly = y + ey * eyeFwd + ny * eyeSep;
  const rx = x + ex * eyeFwd - nx * eyeSep;
  const ry = y + ey * eyeFwd - ny * eyeSep;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(lx, ly, er, 0, Math.PI * 2);
  ctx.arc(rx, ry, er, 0, Math.PI * 2);
  ctx.fill();

  const pr = er * 0.45;
  const px = ex * er * 0.35;
  const py = ey * er * 0.35;
  ctx.fillStyle = "rgba(10,10,12,0.9)";
  ctx.beginPath();
  ctx.arc(lx + px, ly + py, pr, 0, Math.PI * 2);
  ctx.arc(rx + px, ry + py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
