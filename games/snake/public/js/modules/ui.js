import { clamp } from "./utils.js";

export function createUI(els){
  const {
    scoreEl, bestEl,
    overlayEl, overlayTitleEl, overlayDescEl,
    btnRestart, btnSound, soundIcon,
    btnMusic, musicIcon,
    btnFullscreen, fsIcon,
    btnTheme
  } = els;

  let onRestartCb = null;
  let onThemeCb = null;
  let audio = null;

  function refreshMusicUI(){
    if(!audio || !btnMusic || !musicIcon) return;
    const on = audio.isMusicEnabled ? audio.isMusicEnabled() : false;
    musicIcon.textContent = on ? "♫" : "∅";
    btnMusic.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function refreshFullscreenUI(){
    if(!btnFullscreen || !fsIcon) return;
    const isFs = !!document.fullscreenElement;
    fsIcon.textContent = isFs ? "⤡" : "⤢";
    btnFullscreen.setAttribute("aria-pressed", isFs ? "true" : "false");
  }

  function setScore(score){
    scoreEl.textContent = String(score);
  }

  function setBest(best){
    bestEl.textContent = String(best);
  }

  function showOverlay(title, desc){
    overlayTitleEl.textContent = title;
    overlayDescEl.textContent = desc;
    overlayEl.style.opacity = "1";
    overlayEl.style.transform = "translateY(0)";
  }

  function hideOverlay(){
    overlayEl.style.opacity = "0";
    overlayEl.style.transform = "translateY(2px)";
  }

  function onRestart(cb){
    onRestartCb = cb;
  }

  function onThemeToggle(cb){
    onThemeCb = cb;
  }

  function bindAudio(a){
    audio = a;
    // initialize icon state
    refreshSoundUI();
    refreshMusicUI();
  }

  function refreshSoundUI(){
    if(!audio) return;
    const on = audio.isEnabled();
    soundIcon.textContent = on ? "♪" : "∅";
    btnSound.setAttribute("aria-pressed", on ? "true" : "false");
  }

  btnRestart.addEventListener("click", () => onRestartCb && onRestartCb());

  btnTheme.addEventListener("click", () => onThemeCb && onThemeCb());

  btnSound.addEventListener("click", () => {
    if(!audio) return;
    audio.ensureUnlocked();
    audio.setEnabled(!audio.isEnabled());
    refreshSoundUI();
    // haptic-ish feedback on mobile
    if(navigator.vibrate) navigator.vibrate(clamp(18, 10, 30));
  });

  if(btnMusic){
    btnMusic.addEventListener("click", () => {
      if(!audio) return;
      audio.ensureUnlocked();
      audio.setMusicEnabled(!audio.isMusicEnabled());
      refreshMusicUI();
      if(navigator.vibrate) navigator.vibrate(clamp(18, 10, 30));
    });
  }

  if(btnFullscreen){
    btnFullscreen.addEventListener("click", async () => {
      const target = document.querySelector(".app") || document.documentElement;

      // Some browsers (notably iOS Safari) may not support Fullscreen API.
      if(!document.fullscreenEnabled && !target.requestFullscreen){
        // Minimal feedback; keep silent if not supported.
        return;
      }

      try {
        if(document.fullscreenElement){
          await document.exitFullscreen();
        } else {
          await target.requestFullscreen({ navigationUI: "hide" });
        }
      } catch {
        // ignore
      }
      refreshFullscreenUI();
    });

    document.addEventListener("fullscreenchange", refreshFullscreenUI);
    refreshFullscreenUI();
  }

  return {
    setScore,
    setBest,
    showOverlay,
    hideOverlay,
    onRestart,
    onThemeToggle,
    bindAudio,
    refreshSoundUI,
    refreshMusicUI,
    refreshFullscreenUI,
  };
}
