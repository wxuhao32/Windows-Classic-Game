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


  // ====== Audio (SFX) ======
  // 你会自行在 audio/ 文件夹放入：对局.mp3、哎哟.mp3
  const SFX = {
    match: new Audio('./audio/对局.mp3'),
    ouch: new Audio('./audio/哎哟.mp3'),
  };
  for (const a of Object.values(SFX)){
    a.preload = 'auto';
    a.volume = 0.95;
  }
  let audioUnlocked = false;
  function unlockAudio(){
    if (audioUnlocked) return;
    audioUnlocked = true;
    // Try to "warm up" audio on first user gesture (mobile Safari friendly)
    for (const a of Object.values(SFX)){
      try{
        a.muted = true;
        const p = a.play();
        if (p && p.then){
          p.then(()=>{ a.pause(); a.currentTime = 0; a.muted = false; }).catch(()=>{ a.muted = false; });
        } else {
          a.pause(); a.currentTime = 0; a.muted = false;
        }
      } catch(_){}
    }
  }
  function playSfx(a){
    if(!a) return;
    try{
      a.pause();
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(()=>{});
    } catch(_){}
  }

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
    up:false, down:false, left:false, right:false, fire:false
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
  };

  // ====== Objective / Boss ======
  const MATCH_WIN_MS = 120000;        // 2 minutes
  const BOSS_SPAWN_DELAY_MS = 45000;  // 45 seconds after match start
  const BOSS_HP = 5;

  let matchStartedAt = 0;
  let boss = null;
  let bossSpawned = false;
  let bossKilled = false;
  let victory = false;
  let lastOuchAt = 0;
  let hudTick = 0;



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
    return {
      x, y, w: 14, h: 14,
      dir,
      speed: isPlayer ? 70 : (isBoss ? 62 : (55 + Math.min(20, state.level*3))),
      fireCD: 0,
      alive: true,
      hp: isPlayer ? 1 : (isBoss ? 5 : 1),
      isPlayer,
      isBoss,
      ai: isPlayer ? null : {
        turnCD: 0,
        shootBias: isBoss ? 0.88 : (0.5 + Math.random()*0.4),
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
    // Boss is a red enemy tank with 5 HP and faster fire rate.
    const x = Math.floor(WORLD_W/2) - 7;
    const y = 2*TILE;
    const b = makeTank({x, y, dir:'down', isPlayer:false, isBoss:true});
    // boss AI: more aggressive
    b.fireCD = 350;
    b.ai.turnCD = 260;
    tanks.push(b);
    boss = b;
    bossSpawned = true;
    return b;
  }

  function makeBullet(owner){
    const d = DIRS[owner.dir] || DIRS.up;
    const cx = owner.x + owner.w/2;
    const cy = owner.y + owner.h/2;
    const speed = 220;
    const b = {
      x: cx + d.x*10,
      y: cy + d.y*10,
      vx: d.x*speed,
      vy: d.y*speed,
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
  }

  // ====== Game Flow ======
  let player = null;
  let enemySpawnCD = 0;
  const MAX_ENEMIES_ALIVE = 6; // normal enemies on screen (boss not included)

  function resetLevel(){
    grid = makeLevel(state.level);

    tanks.length = 0;
    bullets.length = 0;
    explosions.length = 0;

    state.baseAlive = true;

    player = spawnPlayer();

    enemySpawnCD = 650;
  }

  function resetAll(){
    state.level = 1;
    state.score = 0;
    state.lives = 3;

    matchStartedAt = 0;
    boss = null;
    bossSpawned = false;
    bossKilled = false;
    victory = false;
    hudTick = 0;

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
    showOverlay('游戏结束', msg, { showStart:true, showResume:false });
    paused = true;
    running = true;
  }

  function syncHUD(){
    elScore.textContent = String(state.score);
    elLives.textContent = String(state.lives);

    const ms = matchStartedAt ? Math.max(0, now() - matchStartedAt) : 0;
    const totalSec = Math.floor(ms/1000);
    const mm = Math.floor(totalSec/60);
    const ss = totalSec % 60;
    elLevel.textContent = `${mm}:${String(ss).padStart(2,'0')}`;

    if (victory){
      elEnemies.textContent = '胜利';
    } else if (bossKilled){
      elEnemies.textContent = '已击杀';
    } else if (boss && boss.alive){
      elEnemies.textContent = `${boss.hp}/${BOSS_HP}`;
    } else {
      elEnemies.textContent = (matchStartedAt > 0) ? '未出现' : '未开始';
    }
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
    if(down) unlockAudio();
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
      const down = (ev) => { ev.preventDefault(); unlockAudio(); setKey(k, true); };
      const up = (ev) => { ev.preventDefault(); setKey(k, false); };
      b.addEventListener('pointerdown', down, { passive:false });
      b.addEventListener('pointerup', up, { passive:false });
      b.addEventListener('pointercancel', up, { passive:false });
      b.addEventListener('pointerleave', up, { passive:false });
    }
  }
  bindTouchButtons();

  // Buttons
  btnPause.addEventListener('click', ()=>togglePause());
  btnRestart.addEventListener('click', ()=>restart());
  btnStart.addEventListener('click', ()=>{
    startMatch();
  });
  btnResume.addEventListener('click', ()=>{
    unlockAudio();
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

  function startMatch(){
    // Start a brand new match: play 对局.mp3, reset timer, reset boss status.
    unlockAudio();
    resetAll();
    matchStartedAt = now();
    boss = null;
    bossSpawned = false;
    bossKilled = false;
    victory = false;

    playSfx(SFX.match);
    hideOverlay();
    paused = false;
    if(!running) start();
  }

  function restart(){
    startMatch();
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
    const playerCD = 220;
    t.fireCD = t.isPlayer ? playerCD : (t.isBoss ? Math.round(playerCD/1.15) : (700 - Math.min(280, state.level*25)));
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

    const want = (k) => input[k];
    let moved = false;
    if(want('up'))   { player.dir='up'; moved = moveTank(player, dtMs) || moved; }
    if(want('down')) { player.dir='down'; moved = moveTank(player, dtMs) || moved; }
    if(want('left')) { player.dir='left'; moved = moveTank(player, dtMs) || moved; }
    if(want('right')){ player.dir='right'; moved = moveTank(player, dtMs) || moved; }

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
      ai.turnCD = (t.isBoss ? 240 : 450) + Math.random()*(t.isBoss ? 520 : 850);
    }

    const moved = moveTank(t, dtMs);
    if(!moved){
      // collision -> choose a new direction soon
      ai.turnCD = Math.min(ai.turnCD, 120);
    }

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

        const r = { x:t.x, y:t.y, w:t.w, h:t.h };
        if(b.x > r.x && b.x < r.x+r.w && b.y > r.y && b.y < r.y+r.h){
          b.alive=false;

          if(t.isPlayer){
            // player got hit
            const nowT = now();
            if(nowT - lastOuchAt > 180){
              playSfx(SFX.ouch);
              lastOuchAt = nowT;
            }

            killTank(t);
            state.lives -= 1;
            syncHUD();
            if(state.lives <= 0) gameOver('你被击毁了。');
            else {
              // respawn player
              setTimeout(()=>{
                player = spawnPlayer();
              }, 450);
            }
          } else {
            // enemy got hit (boss has multiple HP)
            t.hp = (t.hp|0) - 1;
            addExplosion(b.x, b.y);

            if(t.hp <= 0){
              killTank(t);
              state.score += t.isBoss ? 800 : 100;

              if(t.isBoss){
                bossKilled = true;
              }
            } else {
              // small knockback-like feedback (visual only)
              addExplosion(t.x + t.w/2, t.y + t.h/2);
            }
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
    if (victory) return;

    // Boss appears after a short warm-up, then you can defeat it any time.
    if(matchStartedAt > 0 && !bossSpawned && (now() - matchStartedAt) >= BOSS_SPAWN_DELAY_MS){
      spawnBoss();
    }

    // Normal enemies keep coming (survival style)
    enemySpawnCD -= dtMs;
    if(enemySpawnCD <= 0){
      const aliveNormals = tanks.filter(t => t.alive && !t.isPlayer && !t.isBoss).length;
      if(aliveNormals < MAX_ENEMIES_ALIVE){
        spawnEnemy();
      }
      const base = bossSpawned ? 720 : 820;
      enemySpawnCD = base - Math.min(260, state.level*18) + Math.random()*260;
    }
  }

  function update(dtMs){
    if(!grid) resetAll();

    if(!state.baseAlive){
      gameOver('基地被摧毁了。');
      return;
    }

    // objective HUD refresh
    hudTick -= dtMs;
    if(hudTick <= 0){
      syncHUD();
      hudTick = 200;
    }

    // victory condition: survive 2 minutes AND kill boss
    if(!victory && matchStartedAt > 0 && bossKilled && (now() - matchStartedAt) >= MATCH_WIN_MS){
      victory = true;
      syncHUD();
      showOverlay('胜利！', '你存活超过两分钟，并击杀了红色 Boss（5血）！', { showStart:true, showResume:false });
      paused = true;
      running = true;
      return;
    }


    updateSpawns(dtMs);

    updatePlayer(dtMs);

    for(const t of tanks){
      if(!t.alive) continue;
      if(t.isPlayer) continue;
      updateEnemy(t, dtMs);
    }

    updateBullets(dtMs);
    updateExplosions(dtMs);

    // cleanup dead enemies
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
      ctx.rotate(DIRS[t.dir]?.a || 0);
      ctx.translate(-t.w/2, -t.h/2);
      ctx.fillStyle = t.isPlayer ? COLORS.player : (t.isBoss ? '#ff1a1a' : COLORS.enemy);
      ctx.fillRect(0,0,t.w,t.h);
      if(t.isBoss){
        const p = Math.max(0, Math.min(1, (t.hp|0) / BOSS_HP));
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, -6, t.w, 3);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(0, -6, t.w*p, 3);
      }
      // turret
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(t.w/2-2, 0, 4, 6);
      // barrel
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(t.w/2-1, -4, 2, 8);
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
    start: () => { startMatch(); },
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
  showOverlay('坦克大战（Boss挑战）', '目标：存活超过 2 分钟，并击杀红色 Boss 坦克（5滴血，射速=玩家×1.15）。\n开始对局会播放 对局.mp3；受击会播放 哎哟.mp3。', { showStart:true, showResume:false });
  render();
})();
