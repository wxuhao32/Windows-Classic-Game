// 接龙纸牌（Klondike）- 纯前端静态
// 特性：全中文 UI；鼠标/触屏拖拽（Pointer Events）；点选移动；撤销；自动收牌；胜利判定
(() => {
  'use strict';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // DOM
  const board = $('#board');
  const tableauEl = $('#tableau');
  const stockEl = $('#stock');
  const wasteEl = $('#waste');
  const foundationEls = $$('[data-drop="foundation"]');
  const btnNew = $('#btnNew');
  const btnUndo = $('#btnUndo');
  const btnAuto = $('#btnAuto');
  const btnRules = $('#btnRules');
  const btnWinNew = $('#btnWinNew');
  const statusText = $('#statusText');

  const rulesModal = $('#rulesModal');
  const winModal = $('#winModal');

  // Card model
  const SUITS = [
    { key:'S', sym:'♠', color:'black' },
    { key:'H', sym:'♥', color:'red' },
    { key:'D', sym:'♦', color:'red' },
    { key:'C', sym:'♣', color:'black' },
  ];
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  const UNDO_LIMIT = 80;

  /** state:
   * cards: [{id,suit(0-3),rank(1-13),faceUp:boolean}]
   * piles:
   *  - stock: [id...]
   *  - waste: [id...]
   *  - foundations: [[ids],[ids],[ids],[ids]]
   *  - tableau: [[ids],... x7]
   * selected: null | { ids:[...], from:{type:'waste'|'tableau', i:number, index:number} }
   */
  let state = null;
  let undoStack = [];
  let drag = null; // active drag { ids, from, ghostEl, offX, offY }
  let dragPending = null; // pending drag { id, from, cardEl, startX, startY, pointerId }

  function suitOf(card){ return SUITS[card.suit]; }
  function colorOf(card){ return suitOf(card).color; }
  function rankLabel(rank){ return RANKS[rank-1]; }

  function cloneState(src){
    // small state; JSON clone is fine
    return JSON.parse(JSON.stringify(src));
  }

  function setStatus(msg){
    if (statusText) statusText.textContent = msg;
  }

  function showModal(modal){
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden','false');
  }
  function hideModal(modal){
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden','true');
  }

  function bindModalClose(){
    $$('[data-close]').forEach(el => {
      el.addEventListener('click', () => {
        const which = el.getAttribute('data-close');
        if (which === 'rules') hideModal(rulesModal);
        if (which === 'win') hideModal(winModal);
      });
    });
  }

  function buildDeck(){
    const cards = [];
    let id = 0;
    for (let s=0; s<4; s++){
      for (let r=1; r<=13; r++){
        cards.push({ id: id++, suit:s, rank:r, faceUp:false });
      }
    }
    return cards;
  }

  function shuffle(arr){
    for (let i=arr.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function initGame(){
    // reset
    undoStack = [];
    btnUndo.disabled = true;
    state = {
      cards: buildDeck(),
      piles: {
        stock: [],
        waste: [],
        foundations: [[],[],[],[]],
        tableau: [[],[],[],[],[],[],[]],
      },
      selected: null,
      started: true, // game started (for win check after moves)
    };

    const ids = state.cards.map(c => c.id);
    shuffle(ids);

    // Deal tableau: column i gets i+1 cards, last one faceUp
    for (let col=0; col<7; col++){
      for (let k=0; k<=col; k++){
        const id = ids.pop();
        const card = state.cards[id];
        card.faceUp = (k === col);
        state.piles.tableau[col].push(id);
      }
    }
    // remaining to stock faceDown
    while (ids.length){
      state.piles.stock.push(ids.pop());
    }

    state.selected = null;
    renderAll();
    setStatus('提示：点击牌库翻牌；手机上可“点选牌→再点目标位置”移动。');
  }

  function pushUndo(){
    undoStack.push(cloneState({ cards: state.cards, piles: state.piles }));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    btnUndo.disabled = undoStack.length === 0;
  }

  function undo(){
    if (!undoStack.length) return;
    const prev = undoStack.pop();
    state.cards = prev.cards;
    state.piles = prev.piles;
    state.selected = null;
    btnUndo.disabled = undoStack.length === 0;
    renderAll();
    setStatus('已撤销一步。');
  }

  function topId(pileArr){ return pileArr.length ? pileArr[pileArr.length-1] : null; }
  function cardById(id){ return state.cards[id]; }

  function isWin(){
    const f = state.piles.foundations;
    return (f[0].length + f[1].length + f[2].length + f[3].length) === 52;
  }

  function checkWinAfterMove(){
    if (!state.started) return;
    if (isWin()) showModal(winModal);
  }

  // ==== Rules checks ====
  function canMoveToFoundation(cardId, fi){
    const f = state.piles.foundations[fi];
    const card = cardById(cardId);
    const top = topId(f);
    if (top == null){
      return card.rank === 1; // Ace
    }
    const topCard = cardById(top);
    return (topCard.suit === card.suit) && (card.rank === topCard.rank + 1);
  }

  function canMoveToTableau(cardId, targetCol){
    const col = state.piles.tableau[targetCol];
    const card = cardById(cardId);
    const top = topId(col);
    if (top == null){
      return card.rank === 13; // King
    }
    const topCard = cardById(top);
    if (!topCard.faceUp) return false;
    const diffColor = colorOf(card) !== colorOf(topCard);
    return diffColor && (card.rank === topCard.rank - 1);
  }

  function getRunFromTableau(colIndex, startIndex){
    const col = state.piles.tableau[colIndex];
    const ids = col.slice(startIndex);
    // Validate that all are faceUp and descending alternating
    for (let i=0; i<ids.length; i++){
      const c = cardById(ids[i]);
      if (!c.faceUp) return null;
      if (i>0){
        const prev = cardById(ids[i-1]);
        const ok = (colorOf(prev) !== colorOf(c)) && (prev.rank === c.rank + 1);
        if (!ok) return null;
      }
    }
    return ids;
  }

  function maybeFlipTopOfTableau(colIndex){
    const col = state.piles.tableau[colIndex];
    if (!col.length) return;
    const top = cardById(col[col.length-1]);
    if (!top.faceUp){
      top.faceUp = true;
    }
  }

  // ==== Moves ====
  function moveIds(from, ids, to){
    // from: {type:'waste'|'tableau', i}
    // to: {type:'foundation'|'tableau', i}
    if (!ids || !ids.length) return false;

    // Validate destination
    if (to.type === 'foundation'){
      if (ids.length !== 1) return false;
      if (!canMoveToFoundation(ids[0], to.i)) return false;
    } else if (to.type === 'tableau'){
      if (!canMoveToTableau(ids[0], to.i)) return false;
    } else {
      return false;
    }

    pushUndo();

    // Remove from source
    if (from.type === 'waste'){
      const waste = state.piles.waste;
      // must be top
      if (topId(waste) !== ids[0]){ undoStack.pop(); btnUndo.disabled = undoStack.length===0; return false; }
      waste.pop();
    } else if (from.type === 'tableau'){
      const col = state.piles.tableau[from.i];
      const idx = col.indexOf(ids[0]);
      if (idx < 0){ undoStack.pop(); btnUndo.disabled = undoStack.length===0; return false; }
      col.splice(idx, ids.length);
    } else {
      undoStack.pop(); btnUndo.disabled = undoStack.length===0; return false;
    }

    // Add to destination
    if (to.type === 'foundation'){
      state.piles.foundations[to.i].push(ids[0]);
    } else {
      state.piles.tableau[to.i].push(...ids);
    }

    // After tableau move, flip source top if needed
    if (from.type === 'tableau') maybeFlipTopOfTableau(from.i);

    state.selected = null;
    renderAll();
    btnUndo.disabled = undoStack.length === 0;
    checkWinAfterMove();
    return true;
  }

  function stockClick(){
    const { stock, waste } = state.piles;
    if (stock.length){
      pushUndo();
      const id = stock.pop();
      cardById(id).faceUp = true;
      waste.push(id);
      state.selected = null;
      renderAll();
      btnUndo.disabled = undoStack.length === 0;
      return;
    }
    if (waste.length){
      pushUndo();
      // recycle: waste -> stock (reverse order), faceDown
      while (waste.length){
        const id = waste.pop();
        cardById(id).faceUp = false;
        stock.push(id);
      }
      state.selected = null;
      renderAll();
      btnUndo.disabled = undoStack.length === 0;
      return;
    }
    // no-op
  }

  // ==== Auto collect ====
  function autoCollect(){
    let moved = false;
    // Repeat until no move
    for (let guard=0; guard<200; guard++){
      let did = false;

      // waste top
      const w = state.piles.waste;
      const wid = topId(w);
      if (wid != null){
        for (let fi=0; fi<4; fi++){
          if (canMoveToFoundation(wid, fi)){
            if (moveIds({type:'waste', i:0}, [wid], {type:'foundation', i:fi})) { did = true; moved = true; }
            break;
          }
        }
      }

      // tableau tops
      for (let ci=0; ci<7 && !did; ci++){
        const col = state.piles.tableau[ci];
        const tid = topId(col);
        if (tid == null) continue;
        const tc = cardById(tid);
        if (!tc.faceUp) continue;
        for (let fi=0; fi<4; fi++){
          if (canMoveToFoundation(tid, fi)){
            if (moveIds({type:'tableau', i:ci}, [tid], {type:'foundation', i:fi})) { did = true; moved = true; }
            break;
          }
        }
      }

      if (!did) break;
    }
    setStatus(moved ? '已自动收牌。' : '当前没有可自动收集的牌。');
  }

  // ==== Rendering ====
  function clearChildren(el){ while (el.firstChild) el.removeChild(el.firstChild); }

  function createCardEl(id){
    const card = cardById(id);
    const el = document.createElement('div');
    el.className = 'card' + (card.faceUp ? '' : ' card--down') + (card.faceUp && colorOf(card)==='red' ? ' card--red' : '');
    el.dataset.id = String(id);
    el.setAttribute('role','listitem');
    el.innerHTML = `
      <div class="card__corner">
        ${card.faceUp ? `${rankLabel(card.rank)}<small>${suitOf(card).sym}</small>` : ''}
      </div>
      <div class="card__center">${card.faceUp ? suitOf(card).sym : ''}</div>
      <div class="card__corner" style="transform: rotate(180deg)">
        ${card.faceUp ? `${rankLabel(card.rank)}<small>${suitOf(card).sym}</small>` : ''}
      </div>
    `;
    return el;
  }

  function renderPiles(){
    // stock: show one face-down card if any
    clearChildren(stockEl.querySelector('.pile__slot'));
    clearChildren(wasteEl.querySelector('.pile__slot'));
    foundationEls.forEach(f => clearChildren(f.querySelector('.pile__slot')));

    const stockSlot = stockEl.querySelector('.pile__slot');
    const wasteSlot = wasteEl.querySelector('.pile__slot');

    if (state.piles.stock.length){
      // render back card
      const id = topId(state.piles.stock);
      const back = createCardEl(id);
      back.classList.add('card--down');
      // force down visuals regardless of actual (should be down)
      stockSlot.appendChild(back);
    }

    const wid = topId(state.piles.waste);
    if (wid != null){
      wasteSlot.appendChild(createCardEl(wid));
    }

    for (let i=0;i<4;i++){
      const fid = topId(state.piles.foundations[i]);
      if (fid != null){
        foundationEls[i].querySelector('.pile__slot').appendChild(createCardEl(fid));
      }
    }
  }

  function renderTableau(){
    clearChildren(tableauEl);
    for (let i=0;i<7;i++){
      const colEl = document.createElement('div');
      colEl.className = 'col';
      colEl.dataset.drop = 'tableau';
      colEl.dataset.i = String(i);
      colEl.setAttribute('role','list');

      const ids = state.piles.tableau[i];
      // stack container
      const stack = document.createElement('div');
      stack.className = 'stack';
      colEl.appendChild(stack);

      ids.forEach((id, idx) => {
        const el = createCardEl(id);
        el.style.top = (idx * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-gap')) ) + 'px';
        stack.appendChild(el);
      });

      tableauEl.appendChild(colEl);
    }
  }

  function renderSelection(){
    // Clear previous
    $$('.card.is-selected').forEach(el => el.classList.remove('is-selected'));
    if (!state.selected) return;
    state.selected.ids.forEach(id => {
      const el = document.querySelector(`.card[data-id="${id}"]`);
      if (el) el.classList.add('is-selected');
    });
  }

  function updateLayoutVars(){
    // Compute card size from available width
    const rect = board.getBoundingClientRect();
    const gap = 10;
    const maxW = Math.floor((rect.width - gap * 6) / 7);
    const cardW = Math.max(44, Math.min(maxW, 86));
    const cardH = Math.round(cardW * 1.38);

    // Compute stack gap from available height to reduce scrolling
    // Use tableau estimated height space
    const appRect = $('#app').getBoundingClientRect();
    const topRowH =  (cardH + 34); // rough
    const footerH = 68;
    const avail = Math.max(220, appRect.height - topRowH - footerH);
    // assume worst-case average 11 cards in a column
    let stackGap = Math.max(10, Math.min(22, Math.floor((avail - cardH) / 10)));
    // keep nice default
    stackGap = Math.min(stackGap, 22);

    const root = document.documentElement;
    root.style.setProperty('--card-w', cardW + 'px');
    root.style.setProperty('--stack-gap', stackGap + 'px');
  }

  function renderAll(){
    updateLayoutVars();
    renderPiles();
    renderTableau();
    renderSelection();
  }

  // ==== Pointer / Click interactions ====
  function isTouchLike(){
    return window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  }

  function getCardElFromEventTarget(t){
    return t && t.closest ? t.closest('.card') : null;
  }

  function getPileFromTarget(t){
    const pile = t && t.closest ? t.closest('[data-drop]') : null;
    if (!pile) return null;
    const type = pile.dataset.drop;
    if (type === 'tableau'){
      return { type:'tableau', i: Number(pile.dataset.i) };
    }
    if (type === 'foundation'){
      return { type:'foundation', i: Number(pile.dataset.i) };
    }
    if (type === 'stock') return { type:'stock', i:0 };
    if (type === 'waste') return { type:'waste', i:0 };
    return null;
  }

  function canStartDrag(cardId, from){
    const card = cardById(cardId);
    if (!card.faceUp) return false;
    if (from.type === 'waste'){
      return topId(state.piles.waste) === cardId;
    }
    if (from.type === 'tableau'){
      const col = state.piles.tableau[from.i];
      const idx = col.indexOf(cardId);
      if (idx < 0) return false;
      return getRunFromTableau(from.i, idx) != null;
    }
    return false;
  }

  function getDragPayload(cardId, from){
    if (from.type === 'waste') return [cardId];
    const col = state.piles.tableau[from.i];
    const idx = col.indexOf(cardId);
    return getRunFromTableau(from.i, idx) || null;
  }

  function beginDrag(ev, cardEl, cardId, from){
    const ids = getDragPayload(cardId, from);
    if (!ids || !ids.length) return;

    // Create ghost
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    // stack ghost cards
    ids.forEach((id, idx) => {
      const cel = createCardEl(id);
      cel.style.position = 'relative';
      cel.style.top = (idx * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--stack-gap')) ) + 'px';
      ghost.appendChild(cel);
    });
    document.body.appendChild(ghost);

    const rect = cardEl.getBoundingClientRect();
    drag = {
      ids,
      from,
      ghostEl: ghost,
      offX: ev.clientX - rect.left,
      offY: ev.clientY - rect.top,
    };
    moveGhost(ev.clientX, ev.clientY);

    cardEl.setPointerCapture(ev.pointerId);
  }

  function moveGhost(x,y){
    if (!drag) return;
    drag.ghostEl.style.transform = `translate(${Math.round(x - drag.offX)}px, ${Math.round(y - drag.offY)}px)`;
  }

  function endDrag(ev){
    if (!drag) return;

    const dropTarget = document.elementFromPoint(ev.clientX, ev.clientY);
    const pile = getPileFromTarget(dropTarget);
    let moved = false;

    if (pile && (pile.type === 'tableau' || pile.type === 'foundation')){
      moved = moveIds(drag.from, drag.ids, pile);
    }

    drag.ghostEl.remove();
    drag = null;

    if (!moved){
      renderAll();
      setStatus('无法放置到该位置。');
    }
  }

  function onPointerDown(ev){
    const cardEl = getCardElFromEventTarget(ev.target);
    if (!cardEl) return;
    const id = Number(cardEl.dataset.id);
    const from = locateCard(id);
    if (!from) return;
    if (!canStartDrag(id, from)) return;

    // Do not start a drag immediately; wait for a small move threshold.
    dragPending = {
      id,
      from,
      cardEl,
      startX: ev.clientX,
      startY: ev.clientY,
      pointerId: ev.pointerId,
    };
    try { cardEl.setPointerCapture(ev.pointerId); } catch (e) {}
  }

  function onPointerMove(ev){
    if (drag){
      moveGhost(ev.clientX, ev.clientY);
      return;
    }
    if (!dragPending) return;
    if (ev.pointerId !== dragPending.pointerId) return;

    const dx = ev.clientX - dragPending.startX;
    const dy = ev.clientY - dragPending.startY;
    if ((dx*dx + dy*dy) < 36) return; // 6px threshold

    // Start real drag
    beginDrag(ev, dragPending.cardEl, dragPending.id, dragPending.from);
    dragPending = null;
  }

  function onPointerUp(ev){
    if (drag){
      endDrag(ev);
      return;
    }
    // No drag started → let click handler do selection/moves.
    dragPending = null;
  }

  function locateCard(id){
    // waste top?
    if (topId(state.piles.waste) === id) return { type:'waste', i:0 };
    // tableau
    for (let i=0;i<7;i++){
      if (state.piles.tableau[i].includes(id)) return { type:'tableau', i };
    }
    return null;
  }

  function onCardClick(ev){
    const cardEl = getCardElFromEventTarget(ev.target);
    if (!cardEl) return;

    const id = Number(cardEl.dataset.id);
    const card = cardById(id);
    const from = locateCard(id);

    // Click to flip faceDown top in tableau
    if (from && from.type === 'tableau'){
      const col = state.piles.tableau[from.i];
      const tid = topId(col);
      if (tid === id && !card.faceUp){
        pushUndo();
        card.faceUp = true;
        state.selected = null;
        renderAll();
        btnUndo.disabled = undoStack.length === 0;
        return;
      }
    }

    // Select movable
    if (!from || !card.faceUp) return;
    if (!canStartDrag(id, from)) return;

    const ids = getDragPayload(id, from);
    state.selected = { ids, from: { type: from.type, i: from.i } };
    renderSelection();
    setStatus('已选中牌：点击目标位置放置，或拖拽移动。');
  }

  function onBoardClick(ev){
    const pile = getPileFromTarget(ev.target);

    // Stock click
    if (pile && pile.type === 'stock'){
      stockClick();
      return;
    }

    // If selected and clicked a drop zone
    if (state.selected && pile && (pile.type === 'tableau' || pile.type === 'foundation')){
      const moved = moveIds(state.selected.from, state.selected.ids, pile);
      if (!moved) setStatus('无法放置到该位置。');
      return;
    }

    // Click empty area clears selection
    if (state.selected && !getCardElFromEventTarget(ev.target)){
      state.selected = null;
      renderSelection();
      setStatus('已取消选中。');
    }
  }

  function onDblClick(ev){
    const cardEl = getCardElFromEventTarget(ev.target);
    if (!cardEl) return;
    const id = Number(cardEl.dataset.id);
    const from = locateCard(id);
    if (!from) return;
    const card = cardById(id);
    if (!card.faceUp) return;

    // only top of waste or top of tableau
    if (from.type === 'waste' && topId(state.piles.waste) !== id) return;
    if (from.type === 'tableau'){
      const col = state.piles.tableau[from.i];
      if (topId(col) !== id) return;
    }

    for (let fi=0; fi<4; fi++){
      if (canMoveToFoundation(id, fi)){
        moveIds(from, [id], { type:'foundation', i: fi });
        setStatus('已自动送入收集区。');
        return;
      }
    }
  }

  // ==== Bind events ====
  function bindEvents(){
    // buttons
    btnNew.addEventListener('click', initGame);
    btnUndo.addEventListener('click', undo);
    btnAuto.addEventListener('click', autoCollect);
    btnRules.addEventListener('click', () => showModal(rulesModal));
    btnWinNew.addEventListener('click', () => { hideModal(winModal); initGame(); });

    bindModalClose();

    // pointer drag events
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointercancel', onPointerUp);

    // click select / drop / stock
    board.addEventListener('click', onBoardClick);
    board.addEventListener('click', onCardClick);

    // double click auto to foundation (desktop)
    board.addEventListener('dblclick', onDblClick);

    // Resize
    const ro = new ResizeObserver(() => renderAll());
    ro.observe($('#app'));
  }

  // Build tableau columns once (for drop zones)
  function ensureTableauColumns(){
    // columns are rendered dynamically; nothing to do here
  }

  // Boot
  function boot(){
    bindEvents();
    initGame();
    // do NOT show win modal on start
    hideModal(winModal);
    hideModal(rulesModal);
  }

  boot();
})();
