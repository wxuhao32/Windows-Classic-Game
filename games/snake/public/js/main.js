import { createGameEngine } from "./modules/engine.js";
import { createRenderer } from "./modules/renderer.js";
import { createInput } from "./modules/input.js";
import { createAudio } from "./modules/audio.js";
import { createUI } from "./modules/ui.js";
import { createTheme } from "./modules/theme.js";

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

// Fit the board size to the viewport so the whole game is visible.
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

// initial layout
fitBoard();

// when fullscreen toggles, recompute size
document.addEventListener("fullscreenchange", () => setTimeout(fitBoard, 60));

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
