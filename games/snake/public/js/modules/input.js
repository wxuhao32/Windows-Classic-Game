import { DIRS } from "./state.js";

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

export function createInput({ element, canvas, onDirection, onInteract }){
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
