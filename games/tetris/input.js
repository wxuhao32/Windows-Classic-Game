/* input.js
   输入系统（手感核心）
   - 不依赖系统键盘 repeat（忽略 e.repeat）
   - 左右：按下立即移动 1 格 → DAS 延迟 → ARR 连发
   - 旋转/硬降：按下触发一次（edge-triggered）
*/
(function(){
  "use strict";

  function nowMs(){ return performance.now ? performance.now() : Date.now(); }

  function InputManager(cfg){
    this.cfg = cfg;

    this.state = {
      left:false,
      right:false,
      softDrop:false
    };

    this._handlers = null;

    // DAS/ARR runtime
    this._lr = {
      dir: 0,          // -1 left, +1 right, 0 none
      held: false,
      tHold: 0,
      tRepeat: 0
    };

    // one-shot queue
    this._queue = {
      rotCW:false,
      rotCCW:false,
      hardDrop:false,
      pause:false,
      restart:false,
      toggleSound:false
    };

    this._keyDown = this._onKeyDown.bind(this);
    this._keyUp = this._onKeyUp.bind(this);
  }

  InputManager.prototype.attach = function(){
    window.addEventListener("keydown", this._keyDown, {passive:false});
    window.addEventListener("keyup", this._keyUp, {passive:false});
  };

  InputManager.prototype.detach = function(){
    window.removeEventListener("keydown", this._keyDown);
    window.removeEventListener("keyup", this._keyUp);
  };

  InputManager.prototype._prevent = function(e){
    // prevent page scroll
    var keys = ["ArrowLeft","ArrowRight","ArrowDown","ArrowUp"," "];
    if (keys.indexOf(e.key) >= 0){
      e.preventDefault();
    }
  };

  InputManager.prototype._onKeyDown = function(e){
    this._prevent(e);
    if (e.repeat) return; // we manage repeats ourselves

    switch(e.key){
      case "ArrowLeft":
        this.state.left = true;
        this._setDir(-1);
        break;
      case "ArrowRight":
        this.state.right = true;
        this._setDir(1);
        break;
      case "ArrowDown":
        this.state.softDrop = true;
        break;
      case "ArrowUp":
      case "x":
      case "X":
        this._queue.rotCW = true;
        break;
      case "z":
      case "Z":
        this._queue.rotCCW = true;
        break;
      case " ":
        this._queue.hardDrop = true;
        break;
      case "p":
      case "P":
        this._queue.pause = true;
        break;
      case "r":
      case "R":
        this._queue.restart = true;
        break;
      case "m":
      case "M":
        this._queue.toggleSound = true;
        break;
    }
  };

  InputManager.prototype._onKeyUp = function(e){
    this._prevent(e);
    switch(e.key){
      case "ArrowLeft":
        this.state.left = false;
        if (this._lr.dir === -1) this._recalcDir();
        break;
      case "ArrowRight":
        this.state.right = false;
        if (this._lr.dir === 1) this._recalcDir();
        break;
      case "ArrowDown":
        this.state.softDrop = false;
        break;
    }
  };

  InputManager.prototype._setDir = function(dir){
    // If switching direction, respond immediately.
    if (this._lr.dir !== dir){
      this._lr.dir = dir;
      this._lr.held = true;
      this._lr.tHold = 0;
      this._lr.tRepeat = 0;
      this._lr._justPressed = true;
    }
  };

  InputManager.prototype._recalcDir = function(){
    if (this.state.left && !this.state.right) this._setDir(-1);
    else if (this.state.right && !this.state.left) this._setDir(1);
    else {
      this._lr.dir = 0;
      this._lr.held = false;
      this._lr.tHold = 0;
      this._lr.tRepeat = 0;
    }
  };

  // Call once per frame with dtMs, returns an action object.
  InputManager.prototype.update = function(dtMs){
    var act = {
      move: 0,
      softDrop: this.state.softDrop,
      rotCW: false,
      rotCCW: false,
      hardDrop: false,
      pause:false,
      restart:false,
      toggleSound:false
    };

    // edge-triggered
    act.rotCW = this._queue.rotCW; this._queue.rotCW = false;
    act.rotCCW = this._queue.rotCCW; this._queue.rotCCW = false;
    act.hardDrop = this._queue.hardDrop; this._queue.hardDrop = false;
    act.pause = this._queue.pause; this._queue.pause = false;
    act.restart = this._queue.restart; this._queue.restart = false;
    act.toggleSound = this._queue.toggleSound; this._queue.toggleSound = false;

    // DAS/ARR movement
    var lr = this._lr;
    if (lr.dir !== 0){
      // immediate move on press
      if (lr._justPressed){
        act.move = lr.dir;
        lr._justPressed = false;
        lr.tHold = 0;
        lr.tRepeat = 0;
      } else {
        lr.tHold += dtMs;
        if (lr.tHold >= this.cfg.DAS_MS){
          lr.tRepeat += dtMs;
          if (this.cfg.ARR_MS === 0){
            // fastest: one per frame
            act.move = lr.dir;
          } else {
            while (lr.tRepeat >= this.cfg.ARR_MS){
              lr.tRepeat -= this.cfg.ARR_MS;
              act.move = lr.dir;
              // only emit one move per frame for consistent feel
              break;
            }
          }
        }
      }
    }

    return act;
  };

  

  // 触控/虚拟按键输入（给移动端按钮使用）
  // key: "ArrowLeft"|"ArrowRight"|"ArrowDown"|"ArrowUp"|" "|"z"|"x"|"p"|"r"|"m"
  InputManager.prototype.vDown = function(key){
    // 复用 keydown 逻辑，但不依赖 DOM 事件对象
    switch(key){
      case "ArrowLeft":
        this.state.left = true;
        this._setDir(-1);
        break;
      case "ArrowRight":
        this.state.right = true;
        this._setDir(1);
        break;
      case "ArrowDown":
        this.state.softDrop = true;
        break;
      case "ArrowUp":
      case "x":
      case "X":
        this._queue.rotCW = true;
        break;
      case "z":
      case "Z":
        this._queue.rotCCW = true;
        break;
      case " ":
        this._queue.hardDrop = true;
        break;
      case "p":
      case "P":
        this._queue.pause = true;
        break;
      case "r":
      case "R":
        this._queue.restart = true;
        break;
      case "m":
      case "M":
        this._queue.toggleSound = true;
        break;
    }
  };

  InputManager.prototype.vUp = function(key){
    switch(key){
      case "ArrowLeft":
        this.state.left = false;
        if (this._lr.dir === -1) this._recalcDir();
        break;
      case "ArrowRight":
        this.state.right = false;
        if (this._lr.dir === 1) this._recalcDir();
        break;
      case "ArrowDown":
        this.state.softDrop = false;
        break;
    }
  };
window.InputManager = InputManager;
})();