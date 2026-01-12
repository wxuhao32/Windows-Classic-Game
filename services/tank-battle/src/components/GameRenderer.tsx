// Canvas renderer for the game

import React, { useRef, useEffect, useCallback } from 'react';
import { GameEngine } from '../game/GameEngine';
import { TileType, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, COLORS, Direction, PowerUpType } from '../game/types';

interface GameRendererProps {
  engine: GameEngine;
}

export const GameRenderer: React.FC<GameRendererProps> = ({ engine }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  useEffect(() => {
    const dpi = window.devicePixelRatio || 1;
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const canvases = [bgRef.current, canvasRef.current, fxRef.current].filter(Boolean) as HTMLCanvasElement[];
    canvases.forEach((c) => {
      c.width = Math.floor(W * dpi);
      c.height = Math.floor(H * dpi);
      c.style.width = W + 'px';
      c.style.height = H + 'px';
      const cctx = c.getContext('2d')!;
      cctx.setTransform(dpi, 0, 0, dpi, 0, 0);
    });
  }, [engine]);


  const render = useCallback((ctx: CanvasRenderingContext2D) => {
    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Render map (back layer - no forest)
    renderMap(ctx, engine.map, false);

    // Render power-ups
    for (const pu of engine.powerUps) {
      const visible = Math.floor(pu.blinkTimer / 200) % 2 === 0;
      if (visible) renderPowerUp(ctx, pu.x, pu.y, pu.type);
    }

    // Render tanks
    if (engine.player) {
      const blink = engine.player.isInvincible && Math.floor(Date.now() / 100) % 2 === 0;
      if (!blink) renderTank(ctx, engine.player.x, engine.player.y, engine.player.direction, engine.player.getColor());
      if (engine.player.isInvincible) {
        renderShield(ctx, engine.player.x, engine.player.y);
      }
    }

    for (const enemy of engine.enemies) {
      renderTank(ctx, enemy.x, enemy.y, enemy.direction, enemy.getColor());
    }

    // Render bullets
    ctx.fillStyle = '#FFFFFF';
    for (const bullet of engine.bulletPool.getActive()) {
      if (bullet.active) {
        ctx.fillRect(bullet.x * TILE_SIZE - 2, bullet.y * TILE_SIZE - 2, 4, 4);
      }
    }

    // Render forest (top layer)
    renderMap(ctx, engine.map, true);

    // Render explosions
    for (const exp of engine.explosionPool.getActive()) {
      if (exp.active) {
        renderExplosion(ctx, exp.x, exp.y, exp.frame);
      }
    }
  }, [engine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const gameLoop = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0.016;
      lastTimeRef.current = time;

      // Cap dt to prevent spiral of death
      const cappedDt = Math.min(dt, 0.05);

      engine.update(cappedDt);

      // 相机震动：通过容器平移（不影响 UI 层）
      const cs = (engine as any).cameraShake;
      if (containerRef.current && cs) {
        containerRef.current.style.transform = `translate(${cs.x || 0}px, ${cs.y || 0}px)`;
      }
      render(ctx);

      frameRef.current = requestAnimationFrame(gameLoop);
    };

    frameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [engine, render]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto"
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        maxHeight: '70vh',
      }}
    >
      <canvas ref={bgRef} className="absolute inset-0 block" />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block"
        style={{ imageRendering: 'pixelated' }}
      />
      <canvas ref={fxRef} className="absolute inset-0 block pointer-events-none" />
    </div>
  );
};

function renderMap(ctx: CanvasRenderingContext2D, map: TileType[][], forestOnly: boolean) {
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const tile = map[y]?.[x];
      if (forestOnly) {
        if (tile === TileType.FOREST) {
          ctx.fillStyle = COLORS.forest;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          // Draw leaf pattern
          ctx.fillStyle = '#1a8c4a';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(x * TILE_SIZE + (i % 2) * 8 + 2, y * TILE_SIZE + Math.floor(i / 2) * 8 + 2, 4, 4);
          }
          ctx.globalAlpha = 1;
        }
      } else {
        switch (tile) {
          case TileType.BRICK:
            ctx.fillStyle = COLORS.brick;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            // Brick pattern
            ctx.fillStyle = '#a04000';
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + 7, TILE_SIZE, 2);
            ctx.fillRect(x * TILE_SIZE + 7, y * TILE_SIZE, 2, 7);
            ctx.fillRect(x * TILE_SIZE + 7, y * TILE_SIZE + 9, 2, 7);
            break;
          case TileType.STEEL:
            ctx.fillStyle = COLORS.steel;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, 5, 5);
            ctx.fillRect(x * TILE_SIZE + 9, y * TILE_SIZE + 2, 5, 5);
            ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 9, 5, 5);
            ctx.fillRect(x * TILE_SIZE + 9, y * TILE_SIZE + 9, 5, 5);
            break;
          case TileType.WATER:
            ctx.fillStyle = COLORS.water;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#2980b9';
            const wave = Math.sin(Date.now() / 300 + x + y) * 2;
            ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 4 + wave, 12, 2);
            ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 10 + wave, 12, 2);
            break;
          case TileType.ICE:
            ctx.fillStyle = COLORS.ice;
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#bdc3c7';
            ctx.fillRect(x * TILE_SIZE + 3, y * TILE_SIZE + 3, 2, 2);
            ctx.fillRect(x * TILE_SIZE + 11, y * TILE_SIZE + 11, 2, 2);
            break;
          case TileType.BASE:
            ctx.fillStyle = COLORS.base;
            // Draw eagle/flag icon
            ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 2, 8, 12);
            ctx.fillStyle = '#000';
            ctx.fillRect(x * TILE_SIZE + 6, y * TILE_SIZE + 4, 4, 4);
            break;
          case TileType.BASE_DESTROYED:
            ctx.fillStyle = '#444';
            ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#222';
            ctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, 8, 8);
            break;
        }
      }
    }
  }
}

function renderTank(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Direction, color: string) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const size = 32;

  ctx.fillStyle = color;

  // Body
  ctx.fillRect(px + 4, py + 4, size - 8, size - 8);

  // Tracks
  ctx.fillStyle = '#333';
  if (dir === Direction.UP || dir === Direction.DOWN) {
    ctx.fillRect(px, py + 2, 6, size - 4);
    ctx.fillRect(px + size - 6, py + 2, 6, size - 4);
  } else {
    ctx.fillRect(px + 2, py, size - 4, 6);
    ctx.fillRect(px + 2, py + size - 6, size - 4, 6);
  }

  // Barrel
  ctx.fillStyle = color;
  switch (dir) {
    case Direction.UP:
      ctx.fillRect(px + 13, py - 4, 6, 16);
      break;
    case Direction.DOWN:
      ctx.fillRect(px + 13, py + size - 12, 6, 16);
      break;
    case Direction.LEFT:
      ctx.fillRect(px - 4, py + 13, 16, 6);
      break;
    case Direction.RIGHT:
      ctx.fillRect(px + size - 12, py + 13, 16, 6);
      break;
  }
}

function renderShield(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const time = Date.now() / 50;

  ctx.strokeStyle = `hsl(${time % 360}, 100%, 70%)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + 16, py + 16, 20, 0, Math.PI * 2);
  ctx.stroke();
}

function renderExplosion(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const colors = ['#FFF', '#FF0', '#F80', '#F00'];
  const sizes = [8, 16, 24, 16];
  const size = sizes[frame] || 16;
  const color = colors[frame] || '#F00';

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 8, y + 8, size, 0, Math.PI * 2);
  ctx.fill();
}

function renderPowerUp(ctx: CanvasRenderingContext2D, x: number, y: number, type: PowerUpType) {
  const px = x * TILE_SIZE;
  const py = y * TILE_SIZE;
  const size = 32;

  // Background
  ctx.fillStyle = '#333';
  ctx.fillRect(px, py, size, size);

  // Icon based on type
  ctx.fillStyle = '#FFF';
  ctx.font = '10px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const labels: Record<PowerUpType, string> = {
    [PowerUpType.HELMET]: 'H',
    [PowerUpType.CLOCK]: 'T',
    [PowerUpType.BOMB]: 'B',
    [PowerUpType.STAR]: '*',
    [PowerUpType.SHOVEL]: 'S',
  };

  ctx.fillText(labels[type], px + size / 2, py + size / 2);
}
