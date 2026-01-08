(() => {
  const desktop = document.getElementById("desktop");
  // Mobile wallpaper cache-buster: ensure replaced PNG shows up even with aggressive CDN caching
  // Put your PNG at: lobby/assets/mobile-wallpaper.png
  function applyMobileWallpaper(){
    try{
      if (window.matchMedia && window.matchMedia("(max-width: 820px)").matches) {
        const ts = Date.now();
        desktop.style.setProperty("--mobile-wallpaper", `url("./assets/mobile-wallpaper.png?v=${ts}")`);
      } else {
        desktop.style.removeProperty("--mobile-wallpaper");
      }
    } catch (e) {}
  }
  applyMobileWallpaper();
  window.addEventListener("resize", applyMobileWallpaper, { passive: true });
  const windowsLayer = document.getElementById("windows");
  const icons = Array.from(document.querySelectorAll(".icon"));
  const taskbarTasks = document.getElementById("taskbarTasks");
  const trayClock = document.getElementById("trayClock");
  const androidTime = document.getElementById("androidTime");
  const androidHomeBtn = document.getElementById("androidHomeBtn");
  const androidBackBtn = document.getElementById("androidBackBtn");

  const mqMobile = window.matchMedia("(max-width: 820px)");

  const GAME_META = {
    "2048": { title: "2048", src: "../games/2048/index.html", icon: "./assets/icon-2048.svg" },
    "minesweeper": { title: "扫雷", src: "../games/minesweeper/index.html", icon: "./assets/icon-minesweeper.svg" },
    "snake": { title: "贪吃蛇", src: "../games/snake/index.html", icon: "./assets/icon-snake.svg" },
    "tetris": { title: "俄罗斯方块", src: "../games/tetris/index.html", icon: "./assets/icon-tetris.svg" },
  };

  let topZ = 10;
  let windowCount = 0;
  let idSeq = 0;

  const winMap = new Map(); // id -> { winEl, taskBtnEl, gameKey }

  function pad2(n){ return String(n).padStart(2,"0"); }
  function updateClocks(){
    const d = new Date();
    const t = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    if (trayClock) trayClock.textContent = t;
    if (androidTime) androidTime.textContent = t;
  }
  updateClocks();
  setInterval(updateClocks, 15000);

  function isMobile(){ return mqMobile.matches; }

  function clearIconSelection() {
    icons.forEach(i => i.classList.remove("is-selected"));
  }
  function selectIcon(btn) {
    clearIconSelection();
    btn.classList.add("is-selected");
  }

  function setActiveTask(id){
    if (!taskbarTasks) return;
    Array.from(taskbarTasks.querySelectorAll(".taskbtn")).forEach(b => {
      b.classList.toggle("is-active", b.dataset.winId === id);
    });
  }

  function bringToFront(win, id) {
    topZ += 1;
    win.style.zIndex = String(topZ);

    Array.from(document.querySelectorAll(".window")).forEach(w => w.classList.toggle("is-front", w === win));
    setActiveTask(id);

    // focus iframe for keyboard immediately (best-effort)
    const iframe = win.querySelector("iframe");
    if (iframe) {
      iframe.focus({ preventScroll: true });
      try { iframe.contentWindow && iframe.contentWindow.focus(); } catch (e) {}
    }
  }

  function calcSpawnPos() {
    windowCount += 1;
    const baseLeft = 160;
    const baseTop = 76;
    const step = 28;
    return { left: baseLeft + step * (windowCount % 8), top: baseTop + step * (windowCount % 6) };
  }

  function makeTaskButton(id, meta){
    if (!taskbarTasks) return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "taskbtn";
    btn.dataset.winId = id;
    btn.innerHTML = `
      <img class="taskbtn__icon" alt="" src="${meta.icon}">
      <span class="taskbtn__text">${meta.title}</span>
    `;
    btn.addEventListener("click", () => {
      const rec = winMap.get(id);
      if (!rec) return;
      bringToFront(rec.winEl, id);
    });
    taskbarTasks.appendChild(btn);
    return btn;
  }

  function closeWindow(id){
    const rec = winMap.get(id);
    if (!rec) return;
    rec.winEl.remove();               // destroys iframe
    if (rec.taskBtnEl) rec.taskBtnEl.remove();
    winMap.delete(id);

    // activate last window if any
    const all = Array.from(document.querySelectorAll(".window"));
    if (all.length){
      const last = all[all.length - 1];
      const found = Array.from(winMap.entries()).find(([,v]) => v.winEl === last);
      bringToFront(last, found ? found[0] : "");
    } else {
      setActiveTask("");
    }
  }

  function closeTopMostMobile(){
    const all = Array.from(document.querySelectorAll(".window"));
    if (!all.length) return;
    const top = all[all.length - 1];
    const id = top.dataset.winId;
    if (id) closeWindow(id);
  }

  function openGame(gameKey) {
    const meta = GAME_META[gameKey];
    if (!meta) return;

    const id = `w${++idSeq}`;
    const win = document.createElement("div");
    win.className = "window";
    win.dataset.winId = id;

    if (!isMobile()){
      const { left, top } = calcSpawnPos();
      win.style.left = left + "px";
      win.style.top = top + "px";
    }

    // Desktop (Windows) template
    const desktopTpl = `
      <div class="titlebar" role="toolbar" aria-label="${meta.title} 窗口标题栏">
        <div class="titlebar__left">
          <img class="titlebar__icon" alt="" src="${meta.icon}">
          <div class="titlebar__title">${meta.title}</div>
        </div>
        <div class="titlebar__btns" aria-label="窗口按钮">
          <button class="winbtn winbtn--min" type="button" data-action="noop" aria-label="最小化（装饰）">
            <span class="glyph glyph--min" aria-hidden="true"></span>
          </button>
          <button class="winbtn winbtn--max" type="button" data-action="noop" aria-label="最大化（装饰）">
            <span class="glyph glyph--max" aria-hidden="true"></span>
          </button>
          <button class="winbtn winbtn--close" type="button" data-action="close" aria-label="关闭 ${meta.title}">
            <span class="glyph glyph--close" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="window__content">
        <iframe class="window__iframe" title="${meta.title}"
          src="${meta.src}"
          loading="eager"
          referrerpolicy="no-referrer"
          allow="fullscreen; autoplay; gamepad *; clipboard-read; clipboard-write"
        ></iframe>
      </div>
    `;

    // Mobile (Android) template: back button closes
    const mobileTpl = `
      <div class="titlebar" role="toolbar" aria-label="${meta.title} 应用标题栏">
        <div class="titlebar__left">
          <button class="android-appbtn" type="button" data-action="close" aria-label="返回并关闭">
            <span class="android-back" aria-hidden="true"></span>
          </button>
          <div class="titlebar__title">${meta.title}</div>
        </div>
        <div class="titlebar__btns" aria-hidden="true"></div>
      </div>
      <div class="window__content">
        <iframe class="window__iframe" title="${meta.title}"
          src="${meta.src}"
          loading="eager"
          referrerpolicy="no-referrer"
          allow="fullscreen; autoplay; gamepad *; clipboard-read; clipboard-write"
        ></iframe>
      </div>
    `;

    win.innerHTML = isMobile() ? mobileTpl : desktopTpl;

    windowsLayer.appendChild(win);

    const taskBtn = makeTaskButton(id, meta);
    winMap.set(id, { winEl: win, taskBtnEl: taskBtn, gameKey });

    bringToFront(win, id);

    // Clicking window brings it to front
    win.addEventListener("pointerdown", () => bringToFront(win, id), { passive: true });

    // Close button(s)
    win.querySelectorAll('[data-action="close"]').forEach(btn => {
      // IMPORTANT: prevent titlebar dragging from stealing the click
      btn.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
      });
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        closeWindow(id);
      });
    });

    // Desktop drag (disable on mobile)
    const titlebar = win.querySelector(".titlebar");
    let drag = null;

    function onPointerMove(ev) {
      if (!drag) return;
      const nx = ev.clientX - drag.dx;
      const ny = ev.clientY - drag.dy;

      const maxX = window.innerWidth - 140;
      const maxY = window.innerHeight - 120;
      win.style.left = Math.max(-40, Math.min(nx, maxX)) + "px";
      win.style.top = Math.max(0, Math.min(ny, maxY)) + "px";
    }

    function onPointerUp() {
      if (!drag) return;
      win.classList.remove("dragging");
      drag = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    }

    titlebar.addEventListener("pointerdown", (ev) => {
      if (isMobile()) return;
      if (ev.button !== 0) return;

      // If pressing on any button inside titlebar, don't start dragging
      if (ev.target && ev.target.closest && ev.target.closest("button")) return;

      bringToFront(win, id);
      const rect = win.getBoundingClientRect();
      drag = { dx: ev.clientX - rect.left, dy: ev.clientY - rect.top };
      win.classList.add("dragging");
      titlebar.setPointerCapture(ev.pointerId);

      window.addEventListener("pointermove", onPointerMove, { passive: true });
      window.addEventListener("pointerup", onPointerUp, { passive: true });
      window.addEventListener("pointercancel", onPointerUp, { passive: true });
    });
  }

  // Icon interactions
const isTouchDevice = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

icons.forEach(btn => {
  // Click:
  // - Desktop: select icon
  // - Mobile/touch: open game (single tap)
  btn.addEventListener("click", (e) => {
    e.stopPropagation();

    if (isMobile() || isTouchDevice) {
      openGame(btn.dataset.game);
      return;
    }
    selectIcon(btn);
  });

  // Desktop: double click to open
  btn.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    if (isMobile()) return; // avoid weirdness when emulating
    openGame(btn.dataset.game);
  });
});

// Click desktop clears selection

  desktop.addEventListener("click", () => clearIconSelection());

  
  // Android bottom navbar actions (mobile only)
  if (androidHomeBtn) {
    androidHomeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!isMobile()) return;
      closeTopMostMobile();
    });
  }
  if (androidBackBtn) {
    androidBackBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!isMobile()) return;
      closeTopMostMobile();
    });
  }

// On resize across breakpoint, keep chrome sane
  if (mqMobile.addEventListener) mqMobile.addEventListener("change", () => {
    // Bring any open window to front to refresh active state and avoid odd focus
    const all = Array.from(document.querySelectorAll(".window"));
    if (all.length){
      const last = all[all.length - 1];
      const found = Array.from(winMap.entries()).find(([,v]) => v.winEl === last);
      bringToFront(last, found ? found[0] : "");
    }
  });
  else if (mqMobile.addListener) mqMobile.addListener(() => {
    // legacy Safari
    const all = Array.from(document.querySelectorAll(".window"));
    if (all.length){
      const last = all[all.length - 1];
      const found = Array.from(winMap.entries()).find(([,v]) => v.winEl === last);
      bringToFront(last, found ? found[0] : "");
    }
  });
})();
