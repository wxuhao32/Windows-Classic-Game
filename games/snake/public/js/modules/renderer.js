import { clamp } from "./utils.js";

// Retro colors are driven by CSS theme; canvas uses computed styles.
// We sample CSS variables once per frame (cheap enough on modern devices).
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function createRenderer(canvas){
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
