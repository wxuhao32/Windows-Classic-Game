/* audio.js
   Retro, low-volume WebAudio. No external files. Toggleable.
*/
(function(){
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }

  function RetroAudio(){
    this.enabled = true;
    this._ctx = null;
    this._master = null;
    this._last = 0;
  }

  RetroAudio.prototype._ensure = function(){
    if (this._ctx) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this._ctx = new Ctx();
    var master = this._ctx.createGain();
    master.gain.value = 0.10; // deliberately quiet
    master.connect(this._ctx.destination);
    this._master = master;
  };

  RetroAudio.prototype.setEnabled = function(on){
    this.enabled = !!on;
    if (this._ctx && !this.enabled){
      // Keep context alive but silence.
      this._master.gain.value = 0.0;
    } else if (this._ctx && this.enabled){
      this._master.gain.value = 0.10;
    }
  };

  RetroAudio.prototype._beep = function(type, freq, dur, vol, bendTo){
    if (!this.enabled) return;
    this._ensure();
    if (!this._ctx) return;

    var now = this._ctx.currentTime;
    // Rate-limit micro-spam
    if (now - this._last < 0.01) return;
    this._last = now;

    var osc = this._ctx.createOscillator();
    var g = this._ctx.createGain();
    osc.type = type || "square";
    var f0 = clamp(freq || 440, 60, 2000);
    osc.frequency.setValueAtTime(f0, now);
    if (bendTo){
      osc.frequency.exponentialRampToValueAtTime(clamp(bendTo,60,2000), now + (dur||0.06));
    }

    var a = 0.002;
    var d = dur || 0.06;
    var v = clamp(vol || 0.25, 0, 1);

    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(v, now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + d);

    osc.connect(g);
    g.connect(this._master);

    osc.start(now);
    osc.stop(now + d + 0.02);
  };

  RetroAudio.prototype.move = function(){ this._beep("square", 220, 0.03, 0.18); };
  RetroAudio.prototype.rotate = function(){ this._beep("square", 330, 0.04, 0.20); };
  RetroAudio.prototype.drop = function(){ this._beep("square", 140, 0.05, 0.22, 90); };
  RetroAudio.prototype.lock = function(){ this._beep("triangle", 180, 0.05, 0.20); };
  RetroAudio.prototype.line = function(lines){
    // a tiny rising arpeggio, restrained
    var base = lines >= 4 ? 320 : 260;
    this._beep("square", base, 0.04, 0.22, base*1.4);
    if (lines >= 2) this._beep("square", base*1.25, 0.04, 0.18, base*1.6);
    if (lines >= 3) this._beep("square", base*1.5, 0.05, 0.16, base*1.8);
  };
  RetroAudio.prototype.gameOver = function(){
    this._beep("triangle", 220, 0.20, 0.24, 110);
  };

  window.RetroAudio = RetroAudio;
})();