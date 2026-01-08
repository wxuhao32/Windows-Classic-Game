/* game.js
   核心规则 & 手感调校（参数集中）
   - 10×20 可见区 + 2 行隐藏区
   - 7-bag 随机
   - SRS-ish 旋转 + wall kick（I / JLSTZ 分表）
   - 锁定延迟 Lock Delay + 重置次数上限（防无限拖）
   - 清行反馈：短促闪光 + 扫描条（克制但不干巴）
   - 重力：使用 fractional level 做平滑升级（不突兀）
*/
(function(){
  "use strict";

  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }

  var TetrisConfig = {
    // 棋盘
    COLS: 10,
    ROWS: 20,
    HIDDEN_ROWS: 2,

    // 单元格逻辑尺寸（渲染会做 DPR 适配）
    CELL: 24,

    // 手感：左右移动
    DAS_MS: 140,
    ARR_MS: 35,

    // 下落
    SOFT_DROP_MULT: 10,
    HARD_DROP_POINTS: 0,
    SOFT_DROP_POINTS: 0,

    // 锁定延迟
    LOCK_DELAY_MS: 480,
    LOCK_RESET_LIMIT: 12,

    // 清行反馈
    LINE_CLEAR_MS: 140,      // 总时长（短）
    LINE_FLASH_MS: 80,       // 前段闪光
    LINE_SWEEP_MS: 140,      // 扫描条时长（与总时长一致）

    // 升级
    LINES_PER_LEVEL: 10,
    MAX_LEVEL: 20,

    // 计分（Guideline-ish，偏耐玩）
    SCORE_SINGLE: 100,
    SCORE_DOUBLE: 300,
    SCORE_TRIPLE: 500,
    SCORE_TETRIS: 800,
    SCORE_COMBO: 50,      // 每段连击基础分

    // 出生位置
    SPAWN_X: 3,
    SPAWN_Y: -2,

    // 预览数量
    NEXT_COUNT: 5
  };

  // 更柔和的经典配色（高对比、不刺眼）
  var COLORS = {
    I: { fill:"#67d7ff", hi:"#b9f0ff", lo:"#2a87b6", out:"#071018" },
    O: { fill:"#ffe066", hi:"#fff3b3", lo:"#b28b1f", out:"#071018" },
    T: { fill:"#c78cff", hi:"#ead1ff", lo:"#6a3fb3", out:"#071018" },
    S: { fill:"#7ef0a0", hi:"#c8ffd8", lo:"#2f9b52", out:"#071018" },
    Z: { fill:"#ff6f7a", hi:"#ffc0c6", lo:"#b13845", out:"#071018" },
    J: { fill:"#7aa0ff", hi:"#cfddff", lo:"#2c4fb5", out:"#071018" },
    L: { fill:"#ffb36b", hi:"#ffe0c2", lo:"#b96a2a", out:"#071018" },
    GHOST: { fill:"rgba(255,255,255,0.10)", out:"rgba(255,255,255,0.18)" },
    FLASH: { fill:"#e9f2ff", hi:"#ffffff", lo:"#b8c7dd", out:"#071018" }
  };

  // 形状（4×4 内坐标），rotation 0..3
  var SHAPES = {
    I: [
      [[0,1],[1,1],[2,1],[3,1]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[1,0],[1,1],[1,2],[1,3]]
    ],
    O: [
      [[1,1],[2,1],[1,2],[2,2]],
      [[1,1],[2,1],[1,2],[2,2]],
      [[1,1],[2,1],[1,2],[2,2]],
      [[1,1],[2,1],[1,2],[2,2]]
    ],
    T: [
      [[1,1],[0,2],[1,2],[2,2]],
      [[1,1],[1,2],[2,2],[1,3]],
      [[0,2],[1,2],[2,2],[1,3]],
      [[1,1],[0,2],[1,2],[1,3]]
    ],
    S: [
      [[1,1],[2,1],[0,2],[1,2]],
      [[1,1],[1,2],[2,2],[2,3]],
      [[1,2],[2,2],[0,3],[1,3]],
      [[0,1],[0,2],[1,2],[1,3]]
    ],
    Z: [
      [[0,1],[1,1],[1,2],[2,2]],
      [[2,1],[1,2],[2,2],[1,3]],
      [[0,2],[1,2],[1,3],[2,3]],
      [[1,1],[0,2],[1,2],[0,3]]
    ],
    J: [
      [[0,1],[0,2],[1,2],[2,2]],
      [[1,1],[2,1],[1,2],[1,3]],
      [[0,2],[1,2],[2,2],[2,3]],
      [[1,1],[1,2],[0,3],[1,3]]
    ],
    L: [
      [[2,1],[0,2],[1,2],[2,2]],
      [[1,1],[1,2],[1,3],[2,3]],
      [[0,2],[1,2],[2,2],[0,3]],
      [[0,1],[1,1],[1,2],[1,3]]
    ]
  };

  // SRS kick 表（JLSTZ / I）
  var KICKS_JLSTZ = {
    "0>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "1>0": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "1>2": [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    "2>1": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "2>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    "3>2": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "3>0": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    "0>3": [[0,0],[1,0],[1,1],[0,-2],[1,-2]]
  };
  var KICKS_I = {
    "0>1": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "1>0": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    "1>2": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    "2>1": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "2>3": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    "3>2": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    "3>0": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "0>3": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
  };

  function makeEmptyBoard(rows, cols){
    var b = new Array(rows);
    for (var r=0;r<rows;r++){
      b[r] = new Array(cols);
      for (var c=0;c<cols;c++) b[r][c] = null;
    }
    return b;
  }

  function shuffle(arr){
    for (var i=arr.length-1;i>0;i--){
      var j = (Math.random()*(i+1))|0;
      var t=arr[i]; arr[i]=arr[j]; arr[j]=t;
    }
    return arr;
  }

  function TetrisGame(audio){
    this.cfg = TetrisConfig;
    this.audio = audio || null;

    this.rowsTotal = this.cfg.ROWS + this.cfg.HIDDEN_ROWS;
    this.board = makeEmptyBoard(this.rowsTotal, this.cfg.COLS);

    this.state = "ready"; // playing|paused|clearing|gameover
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;

    this._bag = [];
    this._next = [];
    this.active = null; // {type, x,y, r}

    // timers
    this._fallAcc = 0;
    this._lockAcc = 0;
    this._lockResets = 0;

    // line clear
    this._clearRows = null;
    this._clearAcc = 0;

    // UI events
    this.events = {
      scoreDirty:true,
      linesDirty:true,
      levelDirty:true,
      lastClear:0
    };

    this._seedNext();
    this.reset();
  }

  TetrisGame.prototype.reset = function(){
    this.board = makeEmptyBoard(this.rowsTotal, this.cfg.COLS);
    this.state = "playing";
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;

    this._bag = [];
    this._next = [];
    this._seedNext();

    this._fallAcc = 0;
    this._lockAcc = 0;
    this._lockResets = 0;
    this._clearRows = null;
    this._clearAcc = 0;

    this.events.scoreDirty = true;
    this.events.linesDirty = true;
    this.events.levelDirty = true;
    this.events.lastClear = 0;

    this._spawn();
  };

  TetrisGame.prototype.togglePause = function(){
    if (this.state === "playing") this.state = "paused";
    else if (this.state === "paused") this.state = "playing";
  };

  TetrisGame.prototype._seedNext = function(){
    while (this._next.length < this.cfg.NEXT_COUNT){
      if (this._bag.length === 0){
        this._bag = shuffle(["I","O","T","S","Z","J","L"]);
      }
      this._next.push(this._bag.pop());
    }
  };

  TetrisGame.prototype._popNext = function(){
    var t = this._next.shift();
    this._seedNext();
    return t;
  };

  TetrisGame.prototype._spawn = function(){
    var t = this._popNext();
    this.active = { type:t, x:this.cfg.SPAWN_X, y:this.cfg.SPAWN_Y, r:0 };
    this._fallAcc = 0;
    this._lockAcc = 0;
    this._lockResets = 0;

    if (this._collides(this.active.x, this.active.y, this.active.r)){
      this.state = "gameover";
      if (this.audio) this.audio.gameOver();
    }
  };

  TetrisGame.prototype._cells = function(type, r){
    return SHAPES[type][((r%4)+4)%4];
  };

  TetrisGame.prototype._collides = function(x, y, r){
    var cells = this._cells(this.active.type, r);
    for (var i=0;i<cells.length;i++){
      var cx = x + cells[i][0];
      var cy = y + cells[i][1];
      if (cx < 0 || cx >= this.cfg.COLS) return true;
      if (cy >= this.rowsTotal) return true;
      if (cy >= 0 && this.board[cy][cx]) return true;
    }
    return false;
  };

  TetrisGame.prototype._isGrounded = function(){
    return this._collides(this.active.x, this.active.y+1, this.active.r);
  };

  TetrisGame.prototype._lockNow = function(){
    var cells = this._cells(this.active.type, this.active.r);
    for (var i=0;i<cells.length;i++){
      var cx = this.active.x + cells[i][0];
      var cy = this.active.y + cells[i][1];
      if (cy >= 0 && cy < this.rowsTotal && cx>=0 && cx<this.cfg.COLS){
        this.board[cy][cx] = this.active.type;
      }
    }
    if (this.audio) this.audio.lock();
    this._checkLines();
  };

  TetrisGame.prototype._checkLines = function(){
    var full = [];
    for (var r=0;r<this.rowsTotal;r++){
      var isFull = true;
      for (var c=0;c<this.cfg.COLS;c++){
        if (!this.board[r][c]) { isFull=false; break; }
      }
      if (isFull) full.push(r);
    }

    if (full.length){
      this.state = "clearing";
      this._clearRows = full;
      this._clearAcc = 0;
      this.events.lastClear = full.length;
      if (this.audio) this.audio.line(full.length);
    } else {
      this._spawn();
    }
  };

  TetrisGame.prototype._applyLineClear = function(){
    var cleared = this._clearRows.slice().sort(function(a,b){return a-b;});
    for (var i=0;i<cleared.length;i++){
      var row = cleared[i];
      this.board.splice(row, 1);
      this.board.unshift(new Array(this.cfg.COLS).fill(null));
    }

    var n = cleared.length;
    // 计分规则（按你的要求）：只有消行才计分，1 行 = 10 分
    // 不计软降/硬降分，不计连击，不乘等级
    var add = n * 10;
    this.combo = -1; // 连击显示关闭（避免误导）

    this.lines += n;

    var prevLevel = this.level;
    this.level = this.getLevel();
    if (this.level !== prevLevel) this.events.levelDirty = true;

    if (add){
      this.score += add;
      this.events.scoreDirty = true;
    }
    this.events.linesDirty = true;

    this._clearRows = null;
    this.state = "playing";
    this._spawn();
  };

  // 平滑等级（用于重力）
  TetrisGame.prototype.getLevelFloat = function(){
    var lf = 1 + (this.lines / this.cfg.LINES_PER_LEVEL);
    return clamp(lf, 1, this.cfg.MAX_LEVEL);
  };
  TetrisGame.prototype.getLevel = function(){
    return Math.floor(this.getLevelFloat());
  };

  // Guideline-ish 重力曲线（用 levelFloat 平滑）
  TetrisGame.prototype.getGravityMs = function(levelFloat){
    var l = clamp(levelFloat, 1, this.cfg.MAX_LEVEL);
    var x = l - 1;
    var seconds = Math.pow(0.8 - x*0.007, x);
    var ms = seconds * 1000;
    return clamp(ms, 55, 1000);
  };

  TetrisGame.prototype.getDropDistance = function(){
    var dy = 0;
    while (!this._collides(this.active.x, this.active.y + dy + 1, this.active.r)) dy++;
    return dy;
  };

  TetrisGame.prototype.getGhostCells = function(){
    var dy = this.getDropDistance();
    var cells = this._cells(this.active.type, this.active.r);
    var out = [];
    for (var i=0;i<cells.length;i++){
      out.push([this.active.x + cells[i][0], this.active.y + cells[i][1] + dy]);
    }
    return out;
  };

  // 清行进度（供渲染使用）
  TetrisGame.prototype.getClearInfo = function(){
    if (this.state !== "clearing" || !this._clearRows) return null;
    var p = clamp(this._clearAcc / this.cfg.LINE_CLEAR_MS, 0, 1);
    return { rows:this._clearRows.slice(), t:this._clearAcc, p:p };
  };

  TetrisGame.prototype.step = function(dtMs, inputState){
    if (this.state !== "playing" && this.state !== "clearing") return;

    if (this.state === "clearing"){
      this._clearAcc += dtMs;
      if (this._clearAcc >= this.cfg.LINE_CLEAR_MS){
        this._applyLineClear();
      }
      return;
    }

    var lf = this.getLevelFloat();
    var gms = this.getGravityMs(lf);

    if (inputState && inputState.softDrop){
      gms = gms / this.cfg.SOFT_DROP_MULT;
    }

    this._fallAcc += dtMs;
    while (this._fallAcc >= gms){
      this._fallAcc -= gms;

      if (!this._collides(this.active.x, this.active.y+1, this.active.r)){
        this.active.y++;
        if (inputState && inputState.softDrop){
          this.score += this.cfg.SOFT_DROP_POINTS;
          this.events.scoreDirty = true;
        }
      } else {
        break;
      }
    }

    // Lock delay
    if (this._isGrounded()){
      this._lockAcc += dtMs;
      if (this._lockAcc >= this.cfg.LOCK_DELAY_MS){
        this._lockNow();
      }
    } else {
      this._lockAcc = 0;
      this._lockResets = 0;
    }
  };

  TetrisGame.prototype._maybeResetLock = function(){
    if (this._isGrounded()){
      if (this._lockResets < this.cfg.LOCK_RESET_LIMIT){
        this._lockAcc = 0;
        this._lockResets++;
      }
    } else {
      this._lockAcc = 0;
      this._lockResets = 0;
    }
  };

  TetrisGame.prototype._tryMove = function(dx, dy){
    if (this.state !== "playing") return false;
    var nx = this.active.x + dx;
    var ny = this.active.y + dy;
    if (!this._collides(nx, ny, this.active.r)){
      this.active.x = nx;
      this.active.y = ny;
      this._maybeResetLock();
      return true;
    }
    return false;
  };

  TetrisGame.prototype.move = function(dx){
    var ok = this._tryMove(dx, 0);
    if (ok && this.audio) this.audio.move();
    return ok;
  };

  TetrisGame.prototype.hardDrop = function(){
    if (this.state !== "playing") return;
    var dist = this.getDropDistance();
    if (dist > 0){
      this.active.y += dist;
      this.score += dist * this.cfg.HARD_DROP_POINTS;
      this.events.scoreDirty = true;
    }
    if (this.audio) this.audio.drop();
    this._lockNow();
  };

  TetrisGame.prototype.rotate = function(dir){
    if (this.state !== "playing") return false;

    var from = this.active.r;
    var to = (from + (dir>0 ? 1 : -1) + 4) % 4;

    if (this.active.type === "O"){
      if (!this._collides(this.active.x, this.active.y, to)){
        this.active.r = to;
        if (this.audio) this.audio.rotate();
        this._maybeResetLock();
        return true;
      }
      return false;
    }

    var key = from + ">" + to;
    var table = (this.active.type === "I") ? KICKS_I : KICKS_JLSTZ;
    var kicks = table[key] || [[0,0]];
    for (var i=0;i<kicks.length;i++){
      var ox = kicks[i][0], oy = kicks[i][1];
      var nx = this.active.x + ox;
      var ny = this.active.y + oy;
      if (!this._collides(nx, ny, to)){
        this.active.x = nx;
        this.active.y = ny;
        this.active.r = to;
        if (this.audio) this.audio.rotate();
        this._maybeResetLock();
        return true;
      }
    }
    return false;
  };

  TetrisGame.prototype.getNextQueue = function(){
    return this._next.slice();
  };

  TetrisGame.prototype.getBoardVisible = function(){
    return this.board.slice(this.cfg.HIDDEN_ROWS);
  };

  TetrisGame.prototype.getColors = function(){
    return COLORS;
  };

  // 导出
  window.TetrisConfig = TetrisConfig;
  window.TetrisGame = TetrisGame;
  window.TETRIS_SHAPES = SHAPES;
})();