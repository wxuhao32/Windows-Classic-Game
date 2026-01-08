import { createInitialState, spawnFood, DIRS, saveBest } from "./state.js";
import { eqPos, oppositeDir, clamp, now } from "./utils.js";

export function createGameEngine({ renderer, ui, audio }){
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
