(() => {
  'use strict';

  const SIZE = 4;
  const MOVE_MS = 120;
  const SWIPE_THRESHOLD = 28; // px
  const STORAGE = {
    THEME: 'retro2048_theme',
    BEST: 'retro2048_best',
    AUDIO: 'retro2048_audio'
  };

  const $ = (sel) => document.querySelector(sel);

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function deepCopyValues(values){
    return values.map(row => row.slice());
  }
  function makeEmptyGrid(){
    return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
  }
  function makeEmptyValues(){
    return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));
  }
  function wait(ms){ return new Promise(r => setTimeout(r, ms)); }
  function randChoice(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  class AudioSfx {
    constructor(){
      this.enabled = true;
      this.ctx = null;
      this.master = null;
    }

    setEnabled(on){
      this.enabled = !!on;
      if (!this.enabled) return;
      // Lazy init: only create AudioContext after first user gesture (handled by ensure())
    }

    ensure(){
      if (!this.enabled) return false;
      if (this.ctx) return true;

      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;

      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      return true;
    }

    _beep({ type='sine', f0=220, f1=null, dur=0.08, gain=0.9, when=0 }){
      if (!this.ensure()) return;
      const t = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      if (f1 != null){
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(g);
      g.connect(this.master);

      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    slide(){
      // a quick "whoop"
      this._beep({ type: 'triangle', f0: 240, f1: 520, dur: 0.065, gain: 0.35 });
    }

    merge(){
      // a slightly brighter ping
      this._beep({ type: 'square', f0: 520, f1: 820, dur: 0.075, gain: 0.28 });
      this._beep({ type: 'sine', f0: 980, f1: 760, dur: 0.09, gain: 0.18, when: 0.02 });
    }

    win(){
      // a tiny 3-note melody
      this._beep({ type: 'sine', f0: 523.25, f1: 659.25, dur: 0.12, gain: 0.22 });
      this._beep({ type: 'sine', f0: 659.25, f1: 783.99, dur: 0.12, gain: 0.22, when: 0.10 });
      this._beep({ type: 'sine', f0: 783.99, f1: 1046.5, dur: 0.16, gain: 0.22, when: 0.20 });
    }
  }

  class Game2048 {
    constructor(){
      // DOM
      this.elScore = $('#score');
      this.elBest = $('#best');
      this.btnNew = $('#btn-new');
      this.btnUndo = $('#btn-undo');
      this.btnTheme = $('#btn-theme');
      this.btnAudio = $('#btn-audio');
      this.board = $('#board');
      this.gridEl = $('#grid');
      this.tilesEl = $('#tiles');

      this.modal = $('#modal');
      this.modalTitle = $('#modal-title');
      this.modalBody = $('#modal-body');
      this.modalClose = $('#modal-close');
      this.modalPrimary = $('#modal-primary');
      this.modalSecondary = $('#modal-secondary');

      // game state
      this.tiles = new Map();      // id -> {id, v, r, c, new, merged}
      this.grid = makeEmptyGrid(); // r,c -> id|null
      this.nextId = 1;

      this.score = 0;
      this.best = 0;

      this.undoSnapshot = null;

      this.over = false;
      this.won = false;
      this.keepPlaying = false;
      this.isAnimating = false;

      this.theme = 'light';

      this.sfx = new AudioSfx();
      this.audioEnabled = true;

      this._pointer = null;

      this._bind();
      this._buildCells();
      this._loadSettings();
      this.reset(true);
      this._resizeObserver();
    }

    _bind(){
      this.btnNew.addEventListener('click', () => this.reset());
      this.btnUndo.addEventListener('click', () => this.undo());
      this.btnTheme.addEventListener('click', () => this.toggleTheme());
      this.btnAudio.addEventListener('click', () => this.toggleAudio());

      window.addEventListener('keydown', (e) => this._onKeyDown(e), { passive: false });

      // Board swipe (Pointer Events where possible)
      this.board.addEventListener('pointerdown', (e) => this._onPointerDown(e));
      this.board.addEventListener('pointermove', (e) => this._onPointerMove(e));
      this.board.addEventListener('pointerup', (e) => this._onPointerUp(e));
      this.board.addEventListener('pointercancel', (e) => this._onPointerUp(e));

      // Modal controls
      this.modalClose.addEventListener('click', () => this._hideModal());
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this._hideModal();
      });
    }

    _resizeObserver(){
      const ro = new ResizeObserver(() => {
        // keep tiles aligned on resize/orientation change
        this.render({ instant: true });
      });
      ro.observe(this.board);
      window.addEventListener('orientationchange', () => this.render({ instant: true }));
    }

    _loadSettings(){
      const t = localStorage.getItem(STORAGE.THEME);
      this.theme = (t === 'dark' || t === 'light') ? t : 'light';
      document.documentElement.setAttribute('data-theme', this.theme);
      this._syncThemeButton();

      const b = Number(localStorage.getItem(STORAGE.BEST) || '0');
      this.best = Number.isFinite(b) ? b : 0;

      const a = localStorage.getItem(STORAGE.AUDIO);
      this.audioEnabled = (a === null) ? true : (a === '1');
      this.sfx.setEnabled(this.audioEnabled);
      this._syncAudioButton();

      this._syncScore();
    }

    _saveBest(){
      localStorage.setItem(STORAGE.BEST, String(this.best));
    }

    _syncThemeButton(){
      this.btnTheme.textContent = `主题：${this.theme === 'dark' ? '暗' : '亮'}`;
      // meta theme color
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', this.theme === 'dark' ? '#0f1114' : '#e7e7e7');
    }

    _syncAudioButton(){
      this.btnAudio.textContent = `音效：${this.audioEnabled ? '开' : '关'}`;
    }

    toggleTheme(){
      this.theme = (this.theme === 'dark') ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', this.theme);
      localStorage.setItem(STORAGE.THEME, this.theme);
      this._syncThemeButton();
      // ensure tiles repaint
      this.render({ instant: true });
    }

    toggleAudio(){
      this.audioEnabled = !this.audioEnabled;
      localStorage.setItem(STORAGE.AUDIO, this.audioEnabled ? '1' : '0');
      this.sfx.setEnabled(this.audioEnabled);
      this._syncAudioButton();
    }

    _buildCells(){
      this.gridEl.innerHTML = '';
      for (let i = 0; i < SIZE * SIZE; i++){
        const d = document.createElement('div');
        d.className = 'cell';
        this.gridEl.appendChild(d);
      }
    }

    reset(initial=false){
      if (this.isAnimating) return;

      this.tiles.clear();
      this.grid = makeEmptyGrid();
      this.nextId = 1;

      this.score = 0;
      this.over = false;
      this.won = false;
      this.keepPlaying = false;
      this.undoSnapshot = null;
      this._syncUndoButton();

      this._clearTilesDom();

      this._spawnRandom();
      this._spawnRandom();
      this.render({ instant: true });

      if (!initial) this.board.focus({ preventScroll: true });
    }

    undo(){
      if (this.isAnimating) return;
      if (!this.undoSnapshot) return;

      const snap = this.undoSnapshot;
      this.undoSnapshot = null;
      this._syncUndoButton();

      this.score = snap.score;
      this.best = snap.best;
      this.over = snap.over;
      this.won = snap.won;
      this.keepPlaying = snap.keepPlaying;

      this._loadFromValues(snap.values);
      this._syncScore();
      this._hideModal();
      this.render({ instant: true });
    }

    _syncUndoButton(){
      this.btnUndo.disabled = !this.undoSnapshot || this.isAnimating;
    }

    _snapshotValues(){
      const values = makeEmptyValues();
      for (let r = 0; r < SIZE; r++){
        for (let c = 0; c < SIZE; c++){
          const id = this.grid[r][c];
          values[r][c] = id ? this.tiles.get(id).v : 0;
        }
      }
      return values;
    }

    _loadFromValues(values){
      this.tiles.clear();
      this.grid = makeEmptyGrid();
      this.nextId = 1;

      this._clearTilesDom();

      for (let r = 0; r < SIZE; r++){
        for (let c = 0; c < SIZE; c++){
          const v = values[r][c] || 0;
          if (v > 0){
            const id = this.nextId++;
            this.tiles.set(id, { id, v, r, c, isNew: false, justMerged: false, isDying: false });
            this.grid[r][c] = id;
          }
        }
      }
    }

    _clearTilesDom(){
      this.tilesEl.innerHTML = '';
    }

    _syncScore(){
      this.elScore.textContent = String(this.score);
      this.elBest.textContent = String(this.best);
    }

    _emptyCells(){
      const empties = [];
      for (let r = 0; r < SIZE; r++){
        for (let c = 0; c < SIZE; c++){
          if (!this.grid[r][c]) empties.push([r, c]);
        }
      }
      return empties;
    }

    _spawnRandom(){
      const empties = this._emptyCells();
      if (empties.length === 0) return false;

      const [r, c] = randChoice(empties);
      const v = Math.random() < 0.1 ? 4 : 2;
      const id = this.nextId++;
      this.tiles.set(id, { id, v, r, c, isNew: true, justMerged: false, isDying: false });
      this.grid[r][c] = id;
      return true;
    }

    _onKeyDown(e){
      const key = e.key;
      const map = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        a: 'left', A: 'left',
        d: 'right', D: 'right',
        w: 'up', W: 'up',
        s: 'down', S: 'down'
      };
      if (!(key in map)) return;

      e.preventDefault();
      this.move(map[key]);
    }

    _onPointerDown(e){
      if (this.isAnimating) return;
      // capture pointer for consistent tracking
      try { this.board.setPointerCapture(e.pointerId); } catch(_){}
      this._pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      // prime audio on user gesture
      this.sfx.ensure();
    }

    _onPointerMove(e){
      if (!this._pointer || this._pointer.id !== e.pointerId) return;
      const dx = e.clientX - this._pointer.x;
      const dy = e.clientY - this._pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this._pointer.moved = true;
      // prevent the page from scrolling
      if (this._pointer.moved) e.preventDefault();
    }

    _onPointerUp(e){
      if (!this._pointer || this._pointer.id !== e.pointerId) return;

      const dx = e.clientX - this._pointer.x;
      const dy = e.clientY - this._pointer.y;
      this._pointer = null;

      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (Math.max(adx, ady) < SWIPE_THRESHOLD) return;

      if (adx > ady){
        this.move(dx > 0 ? 'right' : 'left');
      } else {
        this.move(dy > 0 ? 'down' : 'up');
      }
    }

    _linesFor(dir){
      const lines = [];
      if (dir === 'left' || dir === 'right'){
        for (let r = 0; r < SIZE; r++){
          const coords = [];
          const cols = dir === 'left' ? [0,1,2,3] : [3,2,1,0];
          for (const c of cols) coords.push([r, c]);
          lines.push(coords);
        }
      } else {
        for (let c = 0; c < SIZE; c++){
          const coords = [];
          const rows = dir === 'up' ? [0,1,2,3] : [3,2,1,0];
          for (const r of rows) coords.push([r, c]);
          lines.push(coords);
        }
      }
      return lines;
    }

    _processLine(tileIds){
      const result = [];
      const merges = [];
      let i = 0;
      while (i < tileIds.length){
        const a = tileIds[i];
        const b = tileIds[i + 1];
        if (b && this.tiles.get(a).v === this.tiles.get(b).v){
          result.push(a);
          merges.push({ winner: a, loser: b, newValue: this.tiles.get(a).v * 2, targetIndex: result.length - 1 });
          i += 2;
        } else {
          result.push(a);
          i += 1;
        }
      }
      while (result.length < SIZE) result.push(null);
      return { result, merges };
    }

    _gridSignature(grid){
      // stable signature for changed detection
      let s = '';
      for (let r = 0; r < SIZE; r++){
        for (let c = 0; c < SIZE; c++){
          s += (grid[r][c] ? this.tiles.get(grid[r][c]).v : 0) + ',';
        }
      }
      return s;
    }

    _canMove(){
      // if any empty
      if (this._emptyCells().length) return true;
      // check neighbors for equal
      for (let r = 0; r < SIZE; r++){
        for (let c = 0; c < SIZE; c++){
          const id = this.grid[r][c];
          const v = this.tiles.get(id).v;
          if (r + 1 < SIZE){
            const v2 = this.tiles.get(this.grid[r+1][c]).v;
            if (v === v2) return true;
          }
          if (c + 1 < SIZE){
            const v2 = this.tiles.get(this.grid[r][c+1]).v;
            if (v === v2) return true;
          }
        }
      }
      return false;
    }

    async move(dir){
      if (this.isAnimating) return;
      if (this.over) return;

      const beforeSig = this._gridSignature(this.grid);
      const beforeValues = this._snapshotValues();
      const beforeScore = this.score;
      const beforeBest = this.best;
      const beforeWon = this.won;
      const beforeKeep = this.keepPlaying;

      // clear flags
      for (const t of this.tiles.values()){
        t.justMerged = false;
        t.isNew = false;
        t.isDying = false;
      }

      const newGrid = makeEmptyGrid();
      const mergePlans = [];

      const lines = this._linesFor(dir);
      for (const coords of lines){
        const ids = [];
        for (const [r, c] of coords){
          const id = this.grid[r][c];
          if (id) ids.push(id);
        }
        const { result, merges } = this._processLine(ids);

        // place winners in order
        for (let j = 0; j < SIZE; j++){
          const id = result[j];
          const [tr, tc] = coords[j];
          if (id){
            const tile = this.tiles.get(id);
            tile.r = tr; tile.c = tc;
            newGrid[tr][tc] = id;
          }
        }

        // losers move into winner's target cell (for animation), then get removed
        for (const m of merges){
          const [tr, tc] = coords[m.targetIndex];
          const loser = this.tiles.get(m.loser);
          loser.r = tr; loser.c = tc;
          loser.isDying = true;
          mergePlans.push(m);
        }
      }

      // commit the new grid
      this.grid = newGrid;

      const afterSig = this._gridSignature(this.grid);
      const changed = beforeSig !== afterSig || mergePlans.length > 0;
      if (!changed){
        // no move
        return;
      }

      // snapshot for undo (one step)
      this.undoSnapshot = {
        values: deepCopyValues(beforeValues),
        score: beforeScore,
        best: beforeBest,
        won: beforeWon,
        over: this.over,
        keepPlaying: beforeKeep
      };
      this._syncUndoButton();

      // animate move
      this.isAnimating = true;
      this._syncUndoButton();

      this.sfx.slide();
      this.render({ instant: false });

      await wait(MOVE_MS);

      // apply merges
      let mergedAny = false;
      if (mergePlans.length){
        mergedAny = true;
        for (const m of mergePlans){
          const winner = this.tiles.get(m.winner);
          winner.v = m.newValue;
          winner.justMerged = true;

          this.score += m.newValue;

          // remove loser tile
          this.tiles.delete(m.loser);
        }
        this.sfx.merge();
      }

      // update best
      if (this.score > this.best){
        this.best = this.score;
        this._saveBest();
      }

      // spawn a new tile
      this._spawnRandom();

      // update game state
      if (!this.keepPlaying){
        // win check
        for (const t of this.tiles.values()){
          if (t.v >= 2048){
            this.won = true;
            break;
          }
        }
      }

      // lose check
      if (!this._canMove()){
        this.over = true;
      }

      // render post-merge + spawn
      this._syncScore();
      this.render({ instant: true }); // instant to avoid "double transition" after merge
      this.render({ instant: false }); // then re-enable for subsequent moves (keeps animation flow)
      this.isAnimating = false;
      this._syncUndoButton();

      // modal after unlock (so buttons work)
      if (this.over){
        this._showLose();
      } else if (this.won && !this.keepPlaying){
        this._showWin();
      }
    }

    _layout(){
      const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gap')) || 10;
      const w = this.tilesEl.clientWidth;
      const cell = (w - gap * (SIZE - 1)) / SIZE;
      return { gap, cell };
    }

    render({ instant=false } = {}){
      // sync DOM for tiles
      const existing = new Set();
      for (const [id, t] of this.tiles.entries()){
        existing.add(String(id));
        let el = this.tilesEl.querySelector(`.tile[data-id="${id}"]`);
        if (!el){
          el = document.createElement('div');
          el.className = 'tile';
          el.dataset.id = String(id);
          const num = document.createElement('div');
          num.className = 'num';
          el.appendChild(num);
          this.tilesEl.appendChild(el);

          // remove animation classes after end
          el.addEventListener('animationend', () => {
            el.classList.remove('new');
            el.classList.remove('merged');
          });
        }
      }
      // remove stale elements
      for (const el of Array.from(this.tilesEl.querySelectorAll('.tile'))){
        if (!existing.has(el.dataset.id)){
          el.remove();
        }
      }

      const { gap, cell } = this._layout();

      // (optional) disable transitions for instant layout updates
      const tiles = Array.from(this.tilesEl.querySelectorAll('.tile'));
      if (instant){
        tiles.forEach(el => el.style.transition = 'none');
      } else {
        tiles.forEach(el => el.style.transition = '');
      }

      // apply positions + values
      for (const [id, t] of this.tiles.entries()){
        const el = this.tilesEl.querySelector(`.tile[data-id="${id}"]`);
        if (!el) continue;

        const x = Math.round((cell + gap) * t.c);
        const y = Math.round((cell + gap) * t.r);
        el.style.width = `${Math.round(cell)}px`;
        el.style.height = `${Math.round(cell)}px`;
        el.style.setProperty('--tx', `${x}px`);
        el.style.setProperty('--ty', `${y}px`);
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.dataset.v = String(t.v);
        el.querySelector('.num').textContent = String(t.v);

        // Mark "new" and "merged" for keyframe pops.
        if (t.isNew){
          el.classList.add('new');
          // keyframes use translate(var(--tx), var(--ty)), so keep transform consistent
        }
        if (t.justMerged){
          el.classList.add('merged');
        }
      }

      // restore transitions next frame if instant
      if (instant){
        requestAnimationFrame(() => {
          tiles.forEach(el => el.style.transition = '');
        });
      }
    }

    _showModal({ title, bodyHtml, primaryText, secondaryText, onPrimary, onSecondary }){
      this.modalTitle.textContent = title;
      this.modalBody.innerHTML = bodyHtml;

      this.modalPrimary.textContent = primaryText;
      this.modalSecondary.textContent = secondaryText;

      const cleanup = () => {
        this.modalPrimary.onclick = null;
        this.modalSecondary.onclick = null;
      };

      this.modalPrimary.onclick = () => { cleanup(); onPrimary?.(); };
      this.modalSecondary.onclick = () => { cleanup(); onSecondary?.(); };

      this.modal.classList.remove('hidden');
    }

    _hideModal(){
      // If the user dismisses the win dialog, treat it as "continue".
      if (this.won && !this.keepPlaying && !this.over){
        this.keepPlaying = true;
      }
      this.modal.classList.add('hidden');
    }

    _showWin(){
      this.sfx.win();
      this._showModal({
        title: '胜利！',
        bodyHtml: `
          <p>你合成了 <b>2048</b> 🎉</p>
          <p style="color:var(--muted)">继续挑战更高分，或重新开始再来一局。</p>
        `,
        primaryText: '继续',
        secondaryText: '重新开始',
        onPrimary: () => {
          this.keepPlaying = true;
          this._hideModal();
          this.board.focus({ preventScroll: true });
        },
        onSecondary: () => {
          this._hideModal();
          this.reset();
        }
      });
    }

    _showLose(){
      const canUndo = !!this.undoSnapshot;
      this._showModal({
        title: '失败',
        bodyHtml: `
          <p>没有可移动的方向了。</p>
          <p style="color:var(--muted)">提示：合并 2 的幂，尽量保持棋盘空位。</p>
        `,
        primaryText: '再来一局',
        secondaryText: canUndo ? '撤销一步' : '关闭',
        onPrimary: () => {
          this._hideModal();
          this.reset();
        },
        onSecondary: () => {
          this._hideModal();
          if (canUndo) this.undo();
        }
      });
    }
  }

  // Boot
  window.addEventListener('DOMContentLoaded', () => {
    // eslint-disable-next-line no-new
    new Game2048();
  });
})();
