(() => {
  'use strict';

  // ====== DOM ======
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const elScore = document.getElementById('score');
  const elLives = document.getElementById('lives');
  const elLevel = document.getElementById('level');
  const elEnemies = document.getElementById('enemies');

  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const btnStart = document.getElementById('btnStart');
  const btnResume = document.getElementById('btnResume');
  const btnPause = document.getElementById('btnPause');
  const btnRestart = document.getElementById('btnRestart');

  // ====== Utility ======
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now();

  // ====== Game Constants ======
  const GRID_W = 26;
  const GRID_H = 26;
  const TILE = 16;         // internal logical tile size
  const WORLD_W = GRID_W * TILE;
  const WORLD_H = GRID_H * TILE;

  const COLORS = {
    bg: '#000000',
    wall: '#b35b3a',    // brick
    steel: '#a7adb3',
    water: '#1f5bd5',
    bush: '#158a2a',
    base: '#d9c737',
    player: '#2be06a',
    enemy: '#ff4b4b',
    bullet: '#f2f2f2',
    uiShadow: 'rgba(0,0,0,0.55)'
  };

  // Tile types: 0 empty, 1 brick(destructible), 2 steel, 3 water(block), 4 bush(overlay), 5 base
  const T_EMPTY=0, T_BRICK=1, T_STEEL=2, T_WATER=3, T_BUSH=4, T_BASE=5;

  const DIRS = {
    up:    {x:0, y:-1, a: -Math.PI/2},
    down:  {x:0, y: 1, a:  Math.PI/2},
    left:  {x:-1,y: 0, a:  Math.PI},
    right: {x: 1,y: 0, a:  0},
  };

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'fire',
    KeyP: 'pause',
    KeyR: 'restart',
  };


  // ====== Audio (SFX/VO) ======
  // 用户会自行在 ./audio/ 目录放入：哎哟.mp3、对局.mp3
  const AudioSys = (() => {
    const safeAudio = (src, vol=1) => {
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = vol;
      return a;
    };

    const sys = {
      enabled: true,
      unlocked: false,
      lastOuchMs: 0,
      ouch: safeAudio('./audio/哎哟.mp3', 0.95),
      match: safeAudio('./audio/对局.mp3', 0.95),
      unlock(){
        if(this.unlocked) return;
        this.unlocked = true;
        const warm = (a) => {
          try{
            a.muted = true;
            const p = a.play();
            if(p && p.then){
              p.then(()=>{ a.pause(); a.currentTime = 0; a.muted = false; })
               .catch(()=>{ a.muted = false; });
            } else {
              a.pause(); a.currentTime = 0; a.muted = false;
            }
          }catch(_){}
        };
        warm(this.ouch);
        warm(this.match);
      },
      _play(a){
        if(!this.enabled) return;
        if(!a) return;
        try{
          a.pause();
          a.currentTime = 0;
          a.play().catch(()=>{});
        }catch(_){}
      },
      playMatchStart(){
        this._play(this.match);
      },
      playOuch(){
        const t = now();
        if(t - this.lastOuchMs < 300) return; // 300ms 冷却
        this.lastOuchMs = t;
        this._play(this.ouch);
      }
    };
    return sys;
  })();

  // ====== Micro FX (shake + hit ring) ======
  const fx = {
    shakePx: 0, // screen-space pixels
    rings: [],
    kickShake(px=2){
      this.shakePx = Math.max(this.shakePx, px);
    },
    addRing(x,y){
      this.rings.push({x,y, t:0});
    },
    update(dtMs){
      // shake decay ~80-120ms
      this.shakePx *= Math.exp(-dtMs/95);
      if(this.shakePx < 0.05) this.shakePx = 0;
      for(const r of this.rings) r.t += dtMs;
      for(let i=this.rings.length-1;i>=0;i--){
        if(this.rings[i].t >= 100) this.rings.splice(i,1); // 0.1s
      }
    }
  };

  // ====== State ======
  let dpr = 1;
  function resizeCanvas(){
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  window.addEventListener('resize', resizeCanvas);

  const input = {
    up:false, down:false, left:false, right:false, fire:false,
    joyActive:false, joyAx:0, joyAy:0, joyMag:0, joyAng:0
  };

  let running = false;
  let paused = false;
  let lastT = now();

  const state = {
    level: 1,
    score: 0,
    lives: 3,
    enemiesRemaining: 0,
    baseAlive: true,

    // boss victory mode
    matchTimeMs: 0,
    bossSpawned: false,
    bossKilled: false,
  };

  // ====== World / Level ======
  let grid = null;

  function makeLevel(level){
    // Simple handcrafted layout + slight random noise per level
    const g = new Array(GRID_H).fill(0).map(()=> new Array(GRID_W).fill(T_EMPTY));

    // borders steel
    for(let x=0;x<GRID_W;x++){ g[0][x]=T_STEEL; g[GRID_H-1][x]=T_STEEL; }
    for(let y=0;y<GRID_H;y++){ g[y][0]=T_STEEL; g[y][GRID_W-1]=T_STEEL; }

    // base at bottom center
    const bx = Math.floor(GRID_W/2);
    const by = GRID_H-3;
    g[by][bx]=T_BASE;

    // protect base with bricks
    for (let dy=0;dy<=1;dy++){
      for (let dx=-1;dx<=1;dx++){
        if(dx===0 && dy===0) continue;
        g[by+dy][bx+dx]=T_BRICK;
      }
    }

    // some rivers (water)
    for(let x=4;x<GRID_W-4;x++){
      if(x%6===0){
        g[9][x]=T_WATER; g[10][x]=T_WATER;
      }
    }

    // mid steel blocks
    for(let y=6;y<GRID_H-6;y+=4){
      for(let x=5;x<GRID_W-5;x+=5){
        g[y][x]=T_STEEL;
      }
    }

    // brick mazes
    for(let y=4;y<GRID_H-6;y++){
      for(let x=2;x<GRID_W-2;x++){
        if((x+y+level)%9===0 && g[y][x]===T_EMPTY) g[y][x]=T_BRICK;
        if((x*3+y+level)%37===0 && g[y][x]===T_EMPTY) g[y][x]=T_BUSH;
      }
    }

    // clear spawn lanes
    for(let y=GRID_H-6;y<GRID_H-1;y++){
      for(let x=bx-2;x<=bx+2;x++){
        if(g[y][x]!==T_BASE) g[y][x]=T_EMPTY;
      }
    }
    // enemy spawn lanes
    for(let x of [3, bx, GRID_W-4]){
      for(let y=1;y<5;y++) g[y][x]=T_EMPTY;
    }

    return g;
  }

  function tileAt(px, py){
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if(tx<0||ty<0||tx>=GRID_W||ty>=GRID_H) return T_STEEL;
    return grid[ty][tx];
  }

  function setTile(tx, ty, v){
    if(tx<0||ty<0||tx>=GRID_W||ty>=GRID_H) return;
    grid[ty][tx]=v;
  }

  function rectVsWorld(r){
    // returns true if collides with solid tiles
    const minX = Math.floor(r.x / TILE);
    const maxX = Math.floor((r.x + r.w - 1) / TILE);
    const minY = Math.floor(r.y / TILE);
    const maxY = Math.floor((r.y + r.h - 1) / TILE);

    for(let ty=minY;ty<=maxY;ty++){
      for(let tx=minX;tx<=maxX;tx++){
        const t = (tx<0||ty<0||tx>=GRID_W||ty>=GRID_H) ? T_STEEL : grid[ty][tx];
        if(t===T_EMPTY || t===T_BUSH) continue;
        if(t===T_WATER) return true; // water blocks tanks
        if(t===T_BRICK || t===T_STEEL || t===T_BASE) return true;
      }
    }
    return false;
  }

  function raycastTiles(x0,y0,x1,y1){
    // very small step ray to check line-of-sight blocking tiles
    const steps = Math.ceil(Math.hypot(x1-x0,y1-y0)/4);
    for(let i=0;i<=steps;i++){
      const t = i/steps;
      const x = x0 + (x1-x0)*t;
      const y = y0 + (y1-y0)*t;
      const tt = tileAt(x,y);
      if(tt===T_BRICK||tt===T_STEEL||tt===T_BASE) return true;
    }
    return false;
  }

  // ====== Entities ======
  const tanks = [];
  const bullets = [];
  const explosions = [];

  function makeTank({x,y, dir='up', isPlayer=false, isBoss=false}){
    const a = DIRS[dir]?.a ?? (-Math.PI/2);
    return {
      x, y, w: 14, h: 14,
      dir,
      // continuous movement state (for 360° joystick)
      vx: 0, vy: 0,
      angle: a,
      aimAngle: a,
      speed: isPlayer ? 70 : (isBoss ? 62 : (55 + Math.min(20, state.level*3))),
      bulletSpeedMul: isBoss ? 1.15 : 1.0,
      fireCD: 0,
      alive: true,
      hp: isBoss ? 5 : 1,
      maxHp: isBoss ? 5 : 1,
      hitFlashMs: 0, // player hit white-flash (1~2 frames)
      isPlayer,
      isBoss,
      ai: isPlayer ? null : {
        turnCD: 0,
        shootBias: isBoss ? 0.78 : (0.5 + Math.random()*0.4),
      }
    };
  }


  function spawnPlayer(){
    const x = Math.floor(WORLD_W/2) - 7;
    const y = WORLD_H - TILE*2 - 7;
    const p = makeTank({x,y,dir:'up',isPlayer:true});
    tanks.push(p);
    return p;
  }

  function spawnEnemy(){
    const xs = [3*TILE, Math.floor(WORLD_W/2)-7, WORLD_W-4*TILE];
    const x = xs[Math.floor(Math.random()*xs.length)];
    const y = 2*TILE;
    const e = makeTank({x,y,dir:'down',isPlayer:false});
    e.fireCD = 400 + Math.random()*500;
    e.ai.turnCD = 500 + Math.random()*800;
    tanks.push(e);
    return e;
  }
  function spawnBoss(){
    // Spawn at enemy side (top area)
    const x = Math.floor(WORLD_W/2) - 7;
    const y = 2*TILE;
    const boss = makeTank({x,y,dir:'down',isPlayer:false,isBoss:true});
    boss.fireCD = 220; // a bit more aggressive, but main difference is bullet speed
    boss.ai.turnCD = 380;
    tanks.push(boss);
    return boss;
  }



  function makeBullet(owner){
    const cx = owner.x + owner.w/2;
    const cy = owner.y + owner.h/2;

    // 360° bullet direction (player uses aimAngle; enemies use 4-dir)
    let ang = owner.aimAngle;
    if(typeof ang !== 'number'){
      ang = DIRS[owner.dir]?.a ?? (-Math.PI/2);
    }
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);

    const speed = 220 * (owner.bulletSpeedMul || 1);
    const b = {
      x: cx + dx*10,
      y: cy + dy*10,
      vx: dx*speed,
      vy: dy*speed,
      r: 2.3,
      ownerIsPlayer: owner.isPlayer,
      alive: true
    };
    bullets.push(b);
  }


  function addExplosion(x,y){
    explosions.push({x,y, t:0, alive:true});
  }

  function aabb(a,b){
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function bulletHitsTile(b){
    const tx = Math.floor(b.x / TILE);
    const ty = Math.floor(b.y / TILE);
    if(tx<0||ty<0||tx>=GRID_W||ty>=GRID_H) return true;

    const t = grid[ty][tx];
    if(t===T_EMPTY || t===T_BUSH) return false;

    // handle hit
    if(t===T_BRICK){
      setTile(tx,ty,T_EMPTY);
      return true;
    }
    if(t===T_BASE){
      state.baseAlive = false;
      return true;
    }
    if(t===T_STEEL){
      return true;
    }
    if(t===T_WATER){
      return false; // bullets pass water
    }
    return true;
  }

  function killTank(t){
    t.alive = false;
    addExplosion(t.x + t.w/2, t.y + t.h/2);

    if(t.isBoss){
      state.bossKilled = true;
    }
  }


  // ====== Game Flow ======
  let player = null;
  let enemySpawnCD = 0;
  let maxEnemiesThisLevel = 10;
  let spawnedEnemies = 0;

  function resetLevel(){
    grid = makeLevel(state.level);

    tanks.length = 0;
    bullets.length = 0;
    explosions.length = 0;

    state.baseAlive = true;

    player = spawnPlayer();

    spawnedEnemies = 0;
    maxEnemiesThisLevel = 8 + Math.min(10, state.level*2);
    state.enemiesRemaining = maxEnemiesThisLevel;
    enemySpawnCD = 600;
  }

  function resetAll(){
    state.level = 1;
    state.score = 0;
    state.lives = 3;

    state.matchTimeMs = 0;
    state.bossSpawned = false;
    state.bossKilled = false;

    resetLevel();
    syncHUD();
  }

  function nextLevel(){
    state.level += 1;
    resetLevel();
    syncHUD();
    showOverlay('关卡开始', `第 ${state.level} 关：击毁所有敌人，保护基地！`, { showStart:false, showResume:true });
    paused = true;
  }

  function gameOver(msg){
    showOverlay('游戏结束', msg, { showStart:false, showResume:false });
    paused = true;
    running = true;
  }

  function syncHUD(){
    elScore.textContent = String(state.score);
    elLives.textContent = String(state.lives);
    elLevel.textContent = String(state.level);
    const boss = tanks.find(t => t.alive && t.isBoss);
    if(boss) elEnemies.textContent = `Boss ${boss.hp}/${boss.maxHp}`;
    else elEnemies.textContent = String(tanks.filter(t => t.alive && !t.isPlayer && !t.isBoss).length);
  }

  function showOverlay(title, desc, {showStart=true, showResume=true}={}){
    overlayTitle.textContent = title;
    overlayDesc.textContent = desc;
    btnStart.hidden = !showStart;
    btnResume.hidden = !showResume;
    overlay.hidden = false;
  }
  function hideOverlay(){
    overlay.hidden = true;
  }

  // ====== Input ======
  function setKey(k, down){
    if(k==='pause' && down){ togglePause(); return; }
    if(k==='restart' && down){ restart(); return; }
    if(k in input) input[k] = down;
  }

  function onKey(e, down){
    const k = KEYMAP[e.code];
    if(!k) return;
    e.preventDefault();
    setKey(k, down);
  }
  window.addEventListener('keydown', (e)=>onKey(e,true), { passive:false });
  window.addEventListener('keyup', (e)=>onKey(e,false), { passive:false });

  // Touch buttons
  const touchRoot = document.getElementById('touch');
  function bindTouchButtons(){
    if(!touchRoot) return;
    const btns = Array.from(touchRoot.querySelectorAll('[data-k]'));
    for(const b of btns){
      const k = b.getAttribute('data-k');
      const down = (ev) => { ev.preventDefault(); setKey(k, true); };
      const up = (ev) => { ev.preventDefault(); setKey(k, false); };
      b.addEventListener('pointerdown', down, { passive:false });
      b.addEventListener('pointerup', up, { passive:false });
      b.addEventListener('pointercancel', up, { passive:false });
      b.addEventListener('pointerleave', up, { passive:false });
    }
  }
  bindTouchButtons();

  // 360° virtual joystick (mobile)
  const joyBase = document.getElementById('joyBase');
  const joyStick = document.getElementById('joyStick');
  const joy = {
    active:false,
    pointerId:null,
    cx:0, cy:0,
    radius: 56,
    dead: 7,
  };

  function joyReset(){
    input.joyActive = false;
    input.joyAx = 0; input.joyAy = 0;
    input.joyMag = 0; input.joyAng = 0;
    if(joyStick) joyStick.style.transform = 'translate(-50%, -50%)';
  }

  if(joyBase){
    const updateJoy = (px,py)=>{
      const dx = px - joy.cx;
      const dy = py - joy.cy;
      const dist = Math.hypot(dx,dy);
      const cap = joy.radius;
      const cl = dist > cap ? cap/dist : 1;
      const sx = dx*cl;
      const sy = dy*cl;

      if(joyStick) joyStick.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`;

      const d2 = Math.hypot(sx,sy);
      if(d2 <= joy.dead){
        input.joyActive = false;
        input.joyAx = 0; input.joyAy = 0;
        input.joyMag = 0;
        return;
      }
      const mag = (d2 - joy.dead) / (cap - joy.dead);
      const ang = Math.atan2(sy, sx);
      input.joyActive = true;
      input.joyMag = clamp(mag, 0, 1);
      input.joyAng = ang;
      input.joyAx = Math.cos(ang) * input.joyMag;
      input.joyAy = Math.sin(ang) * input.joyMag;
    };

    joyBase.addEventListener('pointerdown', (ev)=>{
      ev.preventDefault();
      joy.active = true;
      joy.pointerId = ev.pointerId;
      const r = joyBase.getBoundingClientRect();
      joy.cx = r.left + r.width/2;
      joy.cy = r.top + r.height/2;
      joyBase.setPointerCapture(ev.pointerId);
      updateJoy(ev.clientX, ev.clientY);
    }, { passive:false });

    joyBase.addEventListener('pointermove', (ev)=>{
      if(!joy.active || ev.pointerId !== joy.pointerId) return;
      ev.preventDefault();
      updateJoy(ev.clientX, ev.clientY);
    }, { passive:false });

    const end = (ev)=>{
      if(ev.pointerId !== joy.pointerId) return;
      joy.active = false;
      joy.pointerId = null;
      joyReset();
    };
    joyBase.addEventListener('pointerup', end, { passive:false });
    joyBase.addEventListener('pointercancel', end, { passive:false });
    joyBase.addEventListener('lostpointercapture', ()=>joyReset(), { passive:true });

    // in case touch leaves the area
    window.addEventListener('blur', ()=>joyReset(), { passive:true });
  }


  // Buttons
  btnPause.addEventListener('click', ()=>togglePause());
  btnRestart.addEventListener('click', ()=>restart());
  btnStart.addEventListener('click', ()=>{
    AudioSys.unlock();
    AudioSys.playMatchStart();
    hideOverlay();
    paused = false;
    if(!running) start();
  });
  btnResume.addEventListener('click', ()=>{
    hideOverlay();
    paused = false;
  });

  // ====== Update ======
  function togglePause(){
    if(!running) return;
    paused = !paused;
    if(paused){
      showOverlay('已暂停', '点击继续，或按 P 继续。', { showStart:false, showResume:true });
    } else {
      hideOverlay();
    }
  }

  function restart(){
    AudioSys.unlock();
    AudioSys.playMatchStart();
    resetAll();
    hideOverlay();
    paused = false;
    if(!running) start();
  }

  function tryFire(t, dtMs){
    t.fireCD -= dtMs;
    if(t.fireCD > 0) return;
    // limit bullets per tank (simple)
    const existing = bullets.filter(b => b.alive && b.ownerIsPlayer === t.isPlayer);
    if(t.isPlayer){
      // allow 2 bullets
      if(existing.length >= 2) return;
    } else {
      // allow 1 bullet per enemy side
      if(existing.length >= 6) return;
    }
    makeBullet(t);
    t.fireCD = t.isPlayer ? 220 : (700 - Math.min(280, state.level*25));
  }

  function moveTank(t, dtMs){
    const d = DIRS[t.dir] || DIRS.up;
    const dist = t.speed * dtMs / 1000;
    const nx = t.x + d.x*dist;
    const ny = t.y + d.y*dist;
    const r = { x:nx, y:ny, w:t.w, h:t.h };
    if(!rectVsWorld(r)){
      t.x = nx; t.y = ny;
      t.x = clamp(t.x, TILE, WORLD_W - TILE - t.w);
      t.y = clamp(t.y, TILE, WORLD_H - TILE - t.h);
      return true;
    }
    return false;
  }

  function updatePlayer(dtMs){
    if(!player || !player.alive) return;

    // ---- Gather movement input (keyboard or 360° joystick) ----
    let ix = 0, iy = 0;
    let mag = 0;
    let targetAng = player.aimAngle;

    if(input.joyActive){
      ix = input.joyAx;
      iy = input.joyAy;
      mag = input.joyMag;
      if(mag > 0.001) targetAng = input.joyAng;
    } else {
      ix = (input.right ? 1 : 0) + (input.left ? -1 : 0);
      iy = (input.down ? 1 : 0) + (input.up ? -1 : 0);
      const l = Math.hypot(ix, iy);
      if(l > 0){
        ix /= l; iy /= l;
        mag = 1;
        targetAng = Math.atan2(iy, ix);
      }
    }

    // Update facing for bullets & render (smooth)
    if(mag > 0.001){
      // angle lerp shortest path
      const a0 = player.aimAngle;
      let da = targetAng - a0;
      while(da > Math.PI) da -= Math.PI*2;
      while(da < -Math.PI) da += Math.PI*2;
      const turn = 1 - Math.exp(-dtMs/70); // smooth
      player.aimAngle = a0 + da * turn;

      // keep legacy 4-dir for AI interactions (optional)
      const ax = Math.cos(player.aimAngle);
      const ay = Math.sin(player.aimAngle);
      if(Math.abs(ax) > Math.abs(ay)) player.dir = ax>0 ? 'right':'left';
      else player.dir = ay>0 ? 'down':'up';
    }

    // ---- Inertial movement model ----
    const desiredSpeed = player.speed * mag;
    const dvx = Math.cos(targetAng) * desiredSpeed;
    const dvy = Math.sin(targetAng) * desiredSpeed;

    if(mag > 0.001){
      // accelerate quickly, still smooth
      const a = 1 - Math.exp(-dtMs/85);
      player.vx = player.vx + (dvx - player.vx) * a;
      player.vy = player.vy + (dvy - player.vy) * a;
    } else {
      // release: 80~120ms stop
      const k = Math.exp(-dtMs/95);
      player.vx *= k;
      player.vy *= k;
      if(Math.abs(player.vx) < 0.5) player.vx = 0;
      if(Math.abs(player.vy) < 0.5) player.vy = 0;
    }

    // ---- Move with sliding collision (important for narrow roads) ----
    const nx = player.x + player.vx * dtMs / 1000;
    const ny = player.y + player.vy * dtMs / 1000;

    // try X
    if(!rectVsWorld({x:nx, y:player.y, w:player.w, h:player.h})){
      player.x = nx;
    } else {
      player.vx = 0;
    }
    // try Y
    if(!rectVsWorld({x:player.x, y:ny, w:player.w, h:player.h})){
      player.y = ny;
    } else {
      player.vy = 0;
    }

    player.x = clamp(player.x, TILE, WORLD_W - TILE - player.w);
    player.y = clamp(player.y, TILE, WORLD_H - TILE - player.h);

    if(input.fire) tryFire(player, dtMs);
  }

  function updateEnemy(t, dtMs){
    const ai = t.ai;
    ai.turnCD -= dtMs;

    // decide turning
    if(ai.turnCD <= 0){
      // bias: sometimes track player
      if(player && player.alive && Math.random() < 0.45){
        const dx = (player.x+player.w/2) - (t.x+t.w/2);
        const dy = (player.y+player.h/2) - (t.y+t.h/2);
        if(Math.abs(dx) > Math.abs(dy)) t.dir = dx>0 ? 'right':'left';
        else t.dir = dy>0 ? 'down':'up';
      } else {
        const dirs = ['up','down','left','right'];
        t.dir = dirs[Math.floor(Math.random()*dirs.length)];
      }
      ai.turnCD = 450 + Math.random()*850;
    }

    const moved = moveTank(t, dtMs);
    if(!moved){
      // collision -> choose a new direction soon
      ai.turnCD = Math.min(ai.turnCD, 120);
    }

    t.aimAngle = DIRS[t.dir]?.a ?? t.aimAngle;

    // shooting logic
    if(player && player.alive){
      const pcx = player.x + player.w/2;
      const pcy = player.y + player.h/2;
      const tcx = t.x + t.w/2;
      const tcy = t.y + t.h/2;

      const aligned = (Math.abs(pcx - tcx) < 6 && !raycastTiles(tcx,tcy, pcx,pcy)) ||
                      (Math.abs(pcy - tcy) < 6 && !raycastTiles(tcx,tcy, pcx,pcy));

      if(aligned && Math.random() < ai.shootBias){
        // face towards player
        if(Math.abs(pcx - tcx) > Math.abs(pcy - tcy)) t.dir = pcx>tcx ? 'right':'left';
        else t.dir = pcy>tcy ? 'down':'up';
        tryFire(t, dtMs);
      } else if(Math.random() < 0.018){
        tryFire(t, dtMs);
      }
    } else if(Math.random() < 0.02){
      tryFire(t, dtMs);
    }
  }

  function updateBullets(dtMs){
    for(const b of bullets){
      if(!b.alive) continue;
      b.x += b.vx * dtMs / 1000;
      b.y += b.vy * dtMs / 1000;

      // out
      if(b.x<0||b.y<0||b.x>WORLD_W||b.y>WORLD_H){ b.alive=false; continue; }

      // hit world
      if(bulletHitsTile(b)){
        b.alive=false;
        addExplosion(b.x,b.y);
        continue;
      }

      // hit tanks
      for(const t of tanks){
        if(!t.alive) continue;
        if(t.isPlayer === b.ownerIsPlayer) continue;

        if(b.x > t.x && b.x < t.x+t.w && b.y > t.y && b.y < t.y+t.h){
          b.alive=false;

          // Player hit feedback (sound + white flash + shake + impact ring)
          if(t.isPlayer){
            AudioSys.playOuch();
            t.hitFlashMs = 35;           // ~1–2 frames
            fx.kickShake(2);             // 1–2px micro shake
            fx.addRing(b.x, b.y);        // 0.1s white ring
          }

          // Boss HP logic
          if(t.isBoss){
            t.hp -= 1;
            addExplosion(b.x, b.y);
            if(t.hp <= 0){
              killTank(t);
            }
          } else {
            killTank(t);
          }

          if(t.isPlayer){
            state.lives -= 1;
            syncHUD();
            if(state.lives <= 0) gameOver('你被击毁了。');
            else {
              // respawn player
              setTimeout(()=>{
                player = spawnPlayer();
              }, 450);
            }
          } else if(!t.isBoss){
            state.score += 100;
            syncHUD();
          }
          break;
        }
      }
    }
    // clean dead bullets
    for(let i=bullets.length-1;i>=0;i--) if(!bullets[i].alive) bullets.splice(i,1);
  }


  function updateExplosions(dtMs){
    for(const e of explosions){
      if(!e.alive) continue;
      e.t += dtMs;
      if(e.t > 260) e.alive=false;
    }
    for(let i=explosions.length-1;i>=0;i--) if(!explosions[i].alive) explosions.splice(i,1);
  }

  function updateSpawns(dtMs){
    // Boss 出现后不再刷普通敌人（按约定的节奏）
    if(state.bossSpawned) return;

    enemySpawnCD -= dtMs;
    if(enemySpawnCD > 0) return;

    const aliveEnemies = tanks.filter(t => t.alive && !t.isPlayer && !t.isBoss).length;
    const cap = 6; // 常驻敌人上限（避免屏幕塞满）
    if(aliveEnemies < cap){
      spawnEnemy();
      enemySpawnCD = 850 - Math.min(400, state.level*22) + Math.random()*250;
    } else {
      enemySpawnCD = 250;
    }
  }

  function update(dtMs){
    if(!grid) resetAll();

    // timers / micro fx
    fx.update(dtMs);
    state.matchTimeMs += dtMs;

    if(!state.baseAlive){
      gameOver('基地被摧毁了。');
      return;
    }

    // Boss spawn after 2 minutes survival
    if(!state.bossSpawned && state.matchTimeMs >= 120000){
      state.bossSpawned = true;
      spawnBoss();
      // optional: tighten spawn cooldown so boss fight starts immediately
      enemySpawnCD = 999999;
    }

    // Victory: survive 2 minutes + kill boss (player must be alive at the moment)
    if(state.bossSpawned && state.bossKilled && player && player.alive){
      showOverlay('胜利！', '你存活超过两分钟并击毁了敌方 Boss 坦克！', { showStart:false, showResume:false });
      paused = true;
      running = true;
      return;
    }

    updateSpawns(dtMs);

    updatePlayer(dtMs);

    for(const t of tanks){
      if(t.hitFlashMs>0) t.hitFlashMs = Math.max(0, t.hitFlashMs - dtMs);
    }

    for(const t of tanks){
      if(!t.alive) continue;
      if(t.isPlayer) continue;
      updateEnemy(t, dtMs);
    }

    updateBullets(dtMs);
    updateExplosions(dtMs);

    // cleanup dead non-player tanks
    for(let i=tanks.length-1;i>=0;i--){
      if(!tanks[i].alive && !tanks[i].isPlayer) tanks.splice(i,1);
    }
  }

  // ====== Render ======
  function clear(){
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  function worldToScreen(){
    // fit WORLD into canvas with letterbox
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.min(cw / WORLD_W, ch / WORLD_H);
    const ox = (cw - WORLD_W*scale)/2;
    const oy = (ch - WORLD_H*scale)/2;
    return { scale, ox, oy };
  }

  function drawRect(x,y,w,h, color, alpha=1){
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x,y,w,h);
    ctx.globalAlpha = 1;
  }

  function render(){
    clear();
    const shakeX = fx.shakePx ? (Math.random()*2-1)*fx.shakePx*dpr : 0;
    const shakeY = fx.shakePx ? (Math.random()*2-1)*fx.shakePx*dpr : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);
    const {scale, ox, oy} = worldToScreen();

    // background
    // draw world
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    // tiles
    for(let y=0;y<GRID_H;y++){
      for(let x=0;x<GRID_W;x++){
        const t = grid[y][x];
        if(t===T_EMPTY) continue;
        const px = x*TILE;
        const py = y*TILE;

        if(t===T_BRICK){
          // brick: small pattern
          ctx.fillStyle = COLORS.wall;
          ctx.fillRect(px,py,TILE,TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.20)';
          for(let i=2;i<TILE;i+=4){
            ctx.fillRect(px+i,py,1,TILE);
            ctx.fillRect(px,py+i,TILE,1);
          }
        } else if(t===T_STEEL){
          ctx.fillStyle = COLORS.steel;
          ctx.fillRect(px,py,TILE,TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px+2,py+2,TILE-4,TILE-4);
        } else if(t===T_WATER){
          ctx.fillStyle = COLORS.water;
          ctx.fillRect(px,py,TILE,TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(px+2,py+3,TILE-4,3);
        } else if(t===T_BASE){
          ctx.fillStyle = COLORS.base;
          ctx.fillRect(px,py,TILE,TILE);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(px+4,py+4,TILE-8,TILE-8);
        }
      }
    }

    // tanks
    for(const t of tanks){
      if(!t.alive) continue;
      ctx.save();
      ctx.translate(t.x + t.w/2, t.y + t.h/2);

      const rot = t.isPlayer ? (t.aimAngle ?? 0) : (DIRS[t.dir]?.a || 0);
      ctx.rotate(rot);
      ctx.translate(-t.w/2, -t.h/2);

      const col = t.isPlayer ? COLORS.player : (t.isBoss ? '#ff2a2a' : COLORS.enemy);
      ctx.fillStyle = col;
      ctx.fillRect(0,0,t.w,t.h);

      // turret
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(t.w/2-2, 0, 4, 6);

      // barrel
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(t.w/2-1, -4, 2, 8);

      // Boss HP pips (5)
      if(t.isBoss){
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(1, t.h-4, t.w-2, 3);
        const pips = 5;
        const gap = 1;
        const pw = Math.floor((t.w-2 - (pips-1)*gap)/pips);
        for(let i=0;i<pips;i++){
          const alive = i < t.hp;
          ctx.fillStyle = alive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.20)';
          ctx.fillRect(1 + i*(pw+gap), t.h-4, pw, 3);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.strokeRect(0.5,0.5,t.w-1,t.h-1);
      }

      // Player hit white flash (1~2 frames)
      if(t.isPlayer && t.hitFlashMs>0){
        const a = Math.min(1, t.hitFlashMs/35);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,255,255,${0.75*a})`;
        ctx.fillRect(0,0,t.w,t.h);
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.restore();
    }

// bullets
    ctx.fillStyle = COLORS.bullet;
    for(const b of bullets){
      if(!b.alive) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.fill();
    }

    // hit rings (player impact feedback)
    if(fx.rings.length){
      ctx.save();
      for(const r of fx.rings){
        const p = r.t/100;
        const rr = 4 + p*10;
        const a = 1 - p;
        ctx.globalAlpha = 0.95*a;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, rr, 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // bushes on top
    for(let y=0;y<GRID_H;y++){
      for(let x=0;x<GRID_W;x++){
        if(grid[y][x]!==T_BUSH) continue;
        const px = x*TILE;
        const py = y*TILE;
        ctx.fillStyle = COLORS.bush;
        ctx.fillRect(px,py,TILE,TILE);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(px+3,py+3,4,4);
      }
    }

    // explosions
    for(const e of explosions){
      const p = e.t/260;
      const r = 2 + p*10;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = 'rgba(255,200,50,1)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,80,40,1)';
      ctx.beginPath();
      ctx.arc(e.x, e.y, r*0.6, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // vignette
    ctx.restore();

    // little help text (desktop)
    if(!('ontouchstart' in window) && !paused){
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = `${Math.round(12*dpr)}px system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.fillText('WASD / 方向键移动  空格开火  P暂停  R重开', 12*dpr, (canvas.height - 12*dpr));
      ctx.restore();
    }

    // outer shake wrapper restore
    ctx.restore();
  }

  // ====== Loop ======
  function tick(){
    if(!running) return;
    const t = now();
    let dt = t - lastT;
    lastT = t;
    dt = clamp(dt, 0, 32); // avoid huge jumps
    if(!paused){
      update(dt);
    }
    render();
    requestAnimationFrame(tick);
  }

  function start(){
    running = true;
    paused = false;
    lastT = now();
    requestAnimationFrame(tick);
  }

  function destroy(){
    running = false;
    paused = true;
  }

  // ====== Public Control API (for lobby iframe integration) ======
  window.tankGame = {
    start: () => { hideOverlay(); paused=false; if(!running) start(); },
    pause: () => { if(!paused) togglePause(); },
    resume: () => { if(paused){ hideOverlay(); paused=false; } },
    reset: () => { restart(); },
    destroy: () => { destroy(); }
  };

  // ====== Boot ======
  resizeCanvas();
  resetAll();
  syncHUD();
  paused = true;
  showOverlay('坦克大战（单机）', '方向键 / WASD 移动，空格开火。保护基地，击毁所有敌人！', { showStart:true, showResume:true });
  render();
})();
