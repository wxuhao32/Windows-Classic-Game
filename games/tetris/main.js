/* main.js
   - 手机端适配：触控按键 + 响应式布局
   - 全屏：FullScreen API（按钮/快捷键 F 可扩展）
   - 音效：WebAudio（audio.js）
   - 音乐：HTMLAudioElement（用户可放 mp3 到 assets/audio/）
   - 棋盘：Canvas DPR 适配 + sprite 缓存（清晰且流畅）
*/
(function(){
  "use strict";

  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
  function isTouchDevice(){
    return ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
  }

  var CFG = window.TetrisConfig;
  var audio = new window.RetroAudio();
  var game = new window.TetrisGame(audio);
  var input = new window.InputManager(CFG);
  input.attach();

  // DOM: buttons
  var btnSound = document.getElementById("btnSound");
  var btnMusic = document.getElementById("btnMusic");
  var btnFullscreen = document.getElementById("btnFullscreen");
  var btnPause = document.getElementById("btnPause");
  var btnRestart = document.getElementById("btnRestart");

  // DOM: stats
  var uiScore = document.getElementById("uiScore");
  var uiLevel = document.getElementById("uiLevel");
  var uiLines = document.getElementById("uiLines");
  var uiCombo = document.getElementById("uiCombo");

  // DOM: overlay
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayHint = document.getElementById("overlayHint");

  // Music (用户自备 mp3)
  var bgm = document.getElementById("bgm");
  var musicOn = false;
  var MUSIC_PATHS = [
    "assets/audio/bgm.mp3",
    "assets/audio/music.mp3",
    "assets/audio/背景音乐.mp3"
  ];
  bgm.volume = 0.12;

  function tryLoadMusic(){
    // file:// 场景下无法探测文件是否存在；直接设置 src，能播就播，不能播不报错影响游戏
    // 优先使用第一条路径，用户可自行替换/改名
    bgm.src = MUSIC_PATHS[0];
  }
  tryLoadMusic();

  function setSoundUI(){
    btnSound.textContent = "音效：" + (audio.enabled ? "开" : "关");
    btnSound.setAttribute("aria-pressed", audio.enabled ? "true" : "false");
  }
  function setMusicUI(){
    btnMusic.textContent = "音乐：" + (musicOn ? "开" : "关");
    btnMusic.setAttribute("aria-pressed", musicOn ? "true" : "false");
  }
  function setPauseUI(){
    var paused = (game.state === "paused");
    btnPause.textContent = paused ? "继续" : "暂停";
    btnPause.setAttribute("aria-pressed", paused ? "true" : "false");
  }
  function setFullscreenUI(){
    var on = !!document.fullscreenElement;
    btnFullscreen.textContent = on ? "退出全屏" : "全屏";
    btnFullscreen.setAttribute("aria-pressed", on ? "true" : "false");
  }
  function setOverlay(){
    if (game.state === "paused"){
      overlay.classList.remove("hidden");
      overlayTitle.textContent = "暂停";
      overlayHint.textContent = "按 P 继续";
    } else if (game.state === "gameover"){
      overlay.classList.remove("hidden");
      overlayTitle.textContent = "游戏结束";
      overlayHint.textContent = "按 R 重开";
    } else {
      overlay.classList.add("hidden");
    }
  }

  // Button events
  btnSound.addEventListener("click", function(){
    audio.setEnabled(!audio.enabled);
    setSoundUI();
  });

  btnMusic.addEventListener("click", function(){
    // iOS/部分浏览器需要用户手势触发播放
    musicOn = !musicOn;
    if (musicOn){
      bgm.play().catch(function(){ /* 忽略 */ });
    } else {
      bgm.pause();
    }
    setMusicUI();
  });

  btnPause.addEventListener("click", function(){
    game.togglePause();
    setPauseUI();
    setOverlay();
  });

  btnRestart.addEventListener("click", function(){
    game.reset();
    setPauseUI();
    setOverlay();
    syncUI(true);
  });

  btnFullscreen.addEventListener("click", function(){
    toggleFullscreen();
  });

  document.addEventListener("fullscreenchange", setFullscreenUI);

  function toggleFullscreen(){
    var root = document.documentElement;
    if (!document.fullscreenElement){
      if (root.requestFullscreen) root.requestFullscreen().catch(function(){});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(function(){});
    }
  }

  // Canvas: board
  var boardCanvas = document.getElementById("board");
  var boardCtx = boardCanvas.getContext("2d", { alpha:false, desynchronized:true });
  boardCtx.imageSmoothingEnabled = false;

  // Canvas: next
  var nextCanvas = document.getElementById("next");
  var nextCtx = nextCanvas.getContext("2d", { alpha:false, desynchronized:true });
  nextCtx.imageSmoothingEnabled = false;

  // Sizes (logical)
  var cell = CFG.CELL;
  var boardW = CFG.COLS * cell;
  var boardH = CFG.ROWS * cell;

  function resizeCanvas(canvas, ctx, cssW, cssH){
    var dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  var renderScale = 1;
  var spriteCellPx = cell;
  var sprites = {};

  function layout(){
    // 目标：棋盘“完整可见”，优先适配视口高度，其次适配宽度
    var vpH = window.innerHeight || 800;

    // 估算顶部栏高度（含外边距）
    var topbar = document.querySelector(".topbar");
    var topH = topbar ? Math.ceil(topbar.getBoundingClientRect().height) : 56;

    // 估算布局间距：topbar->layout + gameArea padding/border
    var safe = 16; // 安全边距
    var availableH = Math.max(360, vpH - topH - safe - 16);

    // 右侧面板在手机上仍会占高度，所以用“高度优先”的棋盘尺寸
    // 棋盘宽高比固定：boardH/boardW
    var aspect = boardH / boardW;

    // 先按高度算棋盘最大宽度
    var maxBoardCssH = Math.floor(availableH * 0.62); // 给面板/触控留出空间
    // 如果是大屏（桌面），可以更大一点
    if (!window.matchMedia("(max-width: 920px)").matches){
      maxBoardCssH = Math.floor(availableH * 0.92);
    }
    // 最小值避免太小
    maxBoardCssH = Math.max(320, maxBoardCssH);

    var maxBoardCssW_byH = Math.floor(maxBoardCssH / aspect);

    // 再按容器宽度限制
    var rect = boardCanvas.getBoundingClientRect();
    var containerW = Math.floor(rect.width || (window.innerWidth || 400) - 24);

    // 旧逻辑按宽度给 540/420 上限；现在由视口动态控制，再加上宽度上限
    var widthCap = window.matchMedia("(max-width: 720px)").matches ? 420 : 540;
    var cssW = Math.floor(Math.min(containerW, widthCap, maxBoardCssW_byH));
    cssW = Math.max(280, cssW);
    var cssH = Math.floor(cssW * aspect);

    resizeCanvas(boardCanvas, boardCtx, cssW, cssH);
    renderScale = cssW / boardW;

    // Next 预览：在小屏上缩短高度，避免拉长页面
    var nrect = nextCanvas.getBoundingClientRect();
    var nW = Math.floor(nrect.width || 300);
    var nH = window.matchMedia("(max-width: 720px)").matches ? 150 : 220;
    resizeCanvas(nextCanvas, nextCtx, nW, nH);

    rebuildSprites();
  }
  window.addEventListener("resize", layout);

  function makeSprite(pal, s){
    var c = document.createElement("canvas");
    c.width = s; c.height = s;
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = false;

    var pad = 1;
    var x = pad, y = pad;
    var w = s - pad*2;

    g.fillStyle = pal.fill;
    g.fillRect(x, y, w, w);

    g.fillStyle = pal.hi;
    g.fillRect(x, y, w, 2);
    g.fillRect(x, y, 2, w);

    g.fillStyle = pal.lo;
    g.fillRect(x, y + w - 2, w, 2);
    g.fillRect(x + w - 2, y, 2, w);

    g.strokeStyle = pal.out;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, w - 1);

    return c;
  }

  function rebuildSprites(){
    sprites = {};
    var colors = game.getColors();
    var s = Math.max(10, Math.floor(cell * renderScale));
    s = Math.floor(s);
    spriteCellPx = s;

    ["I","O","T","S","Z","J","L"].forEach(function(t){
      sprites[t] = makeSprite(colors[t], s);
    });
    sprites.FLASH = makeSprite(colors.FLASH, s);

    var g = document.createElement("canvas");
    g.width = s; g.height = s;
    var gc = g.getContext("2d");
    gc.imageSmoothingEnabled = false;
    gc.fillStyle = colors.GHOST.fill;
    gc.fillRect(2,2,s-4,s-4);
    gc.strokeStyle = colors.GHOST.out;
    gc.lineWidth = 1;
    gc.strokeRect(2.5,2.5,s-5,s-5);
    sprites.GHOST = g;
  }

  function boardToScreen(x, y){
    return [Math.floor(x * spriteCellPx), Math.floor(y * spriteCellPx)];
  }

  function clearBoard(){
    // draw within CSS space because ctx is scaled by DPR already
    var cssW = Math.floor(boardW * renderScale);
    var cssH = Math.floor(boardH * renderScale);
    boardCtx.fillStyle = "#05080c";
    boardCtx.fillRect(0,0,cssW, cssH);
  }

  function drawGridAndFrame(){
    var cssW = Math.floor(boardW * renderScale);
    var cssH = Math.floor(boardH * renderScale);

    boardCtx.fillStyle = "#060a10";
    boardCtx.fillRect(0,0,cssW, cssH);

    boardCtx.strokeStyle = "rgba(255,255,255,0.05)";
    boardCtx.lineWidth = 1;

    for (var c=0;c<=CFG.COLS;c++){
      var x = Math.floor(c * spriteCellPx) + 0.5;
      boardCtx.beginPath();
      boardCtx.moveTo(x, 0);
      boardCtx.lineTo(x, cssH);
      boardCtx.stroke();
    }
    for (var r=0;r<=CFG.ROWS;r++){
      var y = Math.floor(r * spriteCellPx) + 0.5;
      boardCtx.beginPath();
      boardCtx.moveTo(0, y);
      boardCtx.lineTo(cssW, y);
      boardCtx.stroke();
    }

    boardCtx.strokeStyle = "#152233";
    boardCtx.lineWidth = 2;
    boardCtx.strokeRect(1,1, cssW-2, cssH-2);
  }

  function drawVisibleBoard(){
    var visible = game.getBoardVisible();
    var clearInfo = game.getClearInfo();
    var flashingRows = clearInfo ? clearInfo.rows : null;

    for (var r=0;r<CFG.ROWS;r++){
      var absRow = r + CFG.HIDDEN_ROWS;
      var isFlashing = false;
      if (flashingRows){
        for (var k=0;k<flashingRows.length;k++){
          if (flashingRows[k] === absRow){ isFlashing = true; break; }
        }
      }

      for (var c=0;c<CFG.COLS;c++){
        var t = visible[r][c];
        if (!t) continue;
        var p = boardToScreen(c, r);
        boardCtx.drawImage(isFlashing ? sprites.FLASH : sprites[t], p[0], p[1]);
      }
    }

    if (clearInfo){
      var p2 = clearInfo.p;
      var cssW = Math.floor(boardW * renderScale);
      var barX = Math.floor(cssW * p2);
      boardCtx.save();
      boardCtx.globalAlpha = 0.22;
      boardCtx.fillStyle = "#ffffff";
      for (var i=0;i<clearInfo.rows.length;i++){
        var row = clearInfo.rows[i] - CFG.HIDDEN_ROWS;
        if (row < 0 || row >= CFG.ROWS) continue;
        var y0 = Math.floor(row * spriteCellPx);
        boardCtx.fillRect(barX - 12, y0, 12, spriteCellPx);
      }
      boardCtx.restore();
    }
  }

  function drawCells(cells, spriteKey){
    for (var i=0;i<cells.length;i++){
      var cx = cells[i][0], cy = cells[i][1];
      if (cy < CFG.HIDDEN_ROWS) continue;
      var vr = cy - CFG.HIDDEN_ROWS;
      var p = boardToScreen(cx, vr);
      boardCtx.drawImage(sprites[spriteKey], p[0], p[1]);
    }
  }

  function drawActiveAndGhost(){
    if (!game.active) return;

    drawCells(game.getGhostCells(), "GHOST");

    var cells = window.TETRIS_SHAPES[game.active.type][game.active.r];
    var abs = [];
    for (var i=0;i<cells.length;i++){
      abs.push([game.active.x + cells[i][0], game.active.y + cells[i][1]]);
    }
    drawCells(abs, game.active.type);
  }

  function renderBoard(){
    clearBoard();
    drawGridAndFrame();
    drawVisibleBoard();
    drawActiveAndGhost();
  }

  function drawNext(){
    var rect = nextCanvas.getBoundingClientRect();
    var cssW = Math.floor(rect.width);
    var cssH = Math.floor(rect.height);

    nextCtx.fillStyle = "#05080c";
    nextCtx.fillRect(0,0,cssW,cssH);

    nextCtx.strokeStyle = "#152233";
    nextCtx.lineWidth = 2;
    nextCtx.strokeRect(1,1,cssW-2,cssH-2);

    var queue = game.getNextQueue();
    var mini = window.matchMedia("(max-width: 720px)").matches ? 14 : 16;
    var gap = 10;
    var startY = 10;

    for (var i=0;i<queue.length;i++){
      var t = queue[i];
      var cells = window.TETRIS_SHAPES[t][0];

      var minX=99,maxX=-99,minY=99,maxY=-99;
      for (var j=0;j<cells.length;j++){
        minX=Math.min(minX,cells[j][0]);
        maxX=Math.max(maxX,cells[j][0]);
        minY=Math.min(minY,cells[j][1]);
        maxY=Math.max(maxY,cells[j][1]);
      }
      var w2 = (maxX-minX+1), h2=(maxY-minY+1);
      var offX = Math.floor((4 - w2)/2) - minX;
      var offY = Math.floor((4 - h2)/2) - minY;

      var px = 14;
      var py = startY + i*(mini*3 + gap);

      var pal = game.getColors()[t];
      for (var k=0;k<cells.length;k++){
        var cx = (cells[k][0] + offX);
        var cy = (cells[k][1] + offY);
        var x = px + cx*mini;
        var y = py + cy*mini;

        nextCtx.fillStyle = pal.fill;
        nextCtx.fillRect(x+1,y+1,mini-2,mini-2);
        nextCtx.fillStyle = pal.hi;
        nextCtx.fillRect(x+1,y+1,mini-2,2);
        nextCtx.fillRect(x+1,y+1,2,mini-2);
        nextCtx.fillStyle = pal.lo;
        nextCtx.fillRect(x+1,y+mini-2,mini-2,2);
        nextCtx.fillRect(x+mini-2,y+1,2,mini-2);
        nextCtx.strokeStyle = pal.out;
        nextCtx.lineWidth = 1;
        nextCtx.strokeRect(x+1.5,y+1.5,mini-3,mini-3);
      }
    }
  }

  function syncUI(force){
    if (force || game.events.scoreDirty){
      uiScore.textContent = String(game.score|0);
      game.events.scoreDirty = false;
    }
    if (force || game.events.levelDirty){
      uiLevel.textContent = String(game.level|0);
      game.events.levelDirty = false;
    }
    if (force || game.events.linesDirty){
      uiLines.textContent = String(game.lines|0);
      game.events.linesDirty = false;
    }
    uiCombo.textContent = (game.combo > 0) ? ("x" + game.combo) : "—";
  }

  function handleGlobalActions(act){
    if (act.toggleSound){
      audio.setEnabled(!audio.enabled);
      setSoundUI();
    }
    // 给键盘保留 M 切音乐（可选）：这里用 B 键/按钮即可，键盘暂不占用
    if (act.pause){
      game.togglePause();
      setPauseUI();
      setOverlay();
    }
    if (act.restart && game.state !== "clearing"){
      game.reset();
      setPauseUI();
      setOverlay();
      syncUI(true);
    }
  }

  // Touch controls
  var touch = document.getElementById("touchControls");
  var touchEnabled = isTouchDevice();

  function showTouchControls(){
    if (!touch) return;
    if (touchEnabled){
      touch.classList.remove("hidden");
    }
  }

  function bindTouch(){
    if (!touch) return;

    function onPress(act){
      if (act === "left") input.vDown("ArrowLeft");
      if (act === "right") input.vDown("ArrowRight");
      if (act === "soft") input.vDown("ArrowDown");
      if (act === "rotCCW"){ input.vDown("Z"); } // triggers queue
      if (act === "rotCW"){ input.vDown("X"); }
      if (act === "hard"){ input.vDown(" "); }
    }
    function onRelease(act){
      if (act === "left") input.vUp("ArrowLeft");
      if (act === "right") input.vUp("ArrowRight");
      if (act === "soft") input.vUp("ArrowDown");
      // one-shot actions don't need up
    }

    // Pointer events unify mouse/touch
    touch.addEventListener("pointerdown", function(e){
      var t = e.target;
      if (!t || !t.dataset) return;
      var act = t.dataset.act;
      if (!act) return;
      e.preventDefault();
      t.setPointerCapture(e.pointerId);
      onPress(act);
    }, {passive:false});

    touch.addEventListener("pointerup", function(e){
      var t = e.target;
      if (!t || !t.dataset) return;
      var act = t.dataset.act;
      if (!act) return;
      e.preventDefault();
      onRelease(act);
    }, {passive:false});

    touch.addEventListener("pointercancel", function(e){
      // release all holds safely
      input.vUp("ArrowLeft");
      input.vUp("ArrowRight");
      input.vUp("ArrowDown");
    }, {passive:false});

    // prevent long-press menu/scroll
    touch.addEventListener("contextmenu", function(e){ e.preventDefault(); }, {passive:false});
  }

  // Main loop (stable + responsive)
  var last = performance.now();
  var acc = 0;
  var step = 1000/120;
  var maxSteps = 6;

  function tick(){
    var t = performance.now();
    var dt = t - last;
    last = t;

    dt = clamp(dt, 0, 50);
    acc += dt;

    // per-frame input
    var act = input.update(dt);
    handleGlobalActions(act);

    // per-frame discrete actions
    if (game.state === "playing"){
      if (act.move) game.move(act.move);
      if (act.rotCW) game.rotate(1);
      if (act.rotCCW) game.rotate(-1);
      if (act.hardDrop) game.hardDrop();
    }

    // logic steps
    var steps = 0;
    while (acc >= step && steps < maxSteps){
      acc -= step;
      game.step(step, { softDrop: act.softDrop });
      steps++;
    }

    // UI
    syncUI(false);
    setOverlay();

    // Render
    renderBoard();
    drawNext();

    requestAnimationFrame(tick);
  }

  // Boot
  setSoundUI();
  setMusicUI();
  setPauseUI();
  setFullscreenUI();
  setOverlay();
  layout();
  syncUI(true);
  showTouchControls();
  bindTouch();
  requestAnimationFrame(tick);

})();