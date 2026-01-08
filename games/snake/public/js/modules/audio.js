const SFX_KEY = "snake.sound";
const MUSIC_KEY = "snake.music";

// Default background music path (user will provide an mp3 under public/audio)
const DEFAULT_MUSIC_SRC = "./audio/bgm.mp3";

export function createAudio(){
  let ctx = null;
  let sfxEnabled = loadSfxEnabled();

  let musicEnabled = loadMusicEnabled();
  let musicSrc = DEFAULT_MUSIC_SRC;
  let musicEl = null;

  function loadSfxEnabled(){
    const raw = localStorage.getItem(SFX_KEY);
    if(raw === null) return true;
    return raw === "1";
  }

  function saveSfxEnabled(v){
    localStorage.setItem(SFX_KEY, v ? "1" : "0");
  }

  function loadMusicEnabled(){
    const raw = localStorage.getItem(MUSIC_KEY);
    if(raw === null) return false;
    return raw === "1";
  }

  function saveMusicEnabled(v){
    localStorage.setItem(MUSIC_KEY, v ? "1" : "0");
  }

  function ensureMusicEl(){
    if(!musicEl){
      musicEl = new Audio(musicSrc);
      musicEl.loop = true;
      musicEl.preload = "auto";
      musicEl.volume = 0.35;
      // iOS: inline playback is usually required
      musicEl.playsInline = true;
    }
    return musicEl;
  }

  function ensureUnlocked(){
    // Must be called from user gesture to avoid autoplay blocks
    if(!ctx){
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
    }
    if(ctx.state === "suspended"){
      ctx.resume().catch(()=>{});
    }

    // If user has enabled music, try to start it on first interaction.
    if(musicEnabled){
      playMusic();
    }
  }

  function setSfxEnabled(v){
    sfxEnabled = !!v;
    saveSfxEnabled(sfxEnabled);
  }

  function isSfxEnabled(){
    return sfxEnabled;
  }

  function setMusicEnabled(v){
    musicEnabled = !!v;
    saveMusicEnabled(musicEnabled);
    if(!musicEnabled){
      stopMusic();
    } else {
      // only actually plays after a user gesture
      playMusic();
    }
  }

  function isMusicEnabled(){
    return musicEnabled;
  }

  function setMusicSrc(src){
    musicSrc = src || DEFAULT_MUSIC_SRC;
    if(musicEl){
      const wasPlaying = !musicEl.paused;
      musicEl.pause();
      musicEl = null;
      if(wasPlaying && musicEnabled){
        playMusic();
      }
    }
  }

  function playMusic(){
    if(!musicEnabled) return;
    try {
      const el = ensureMusicEl();
      const p = el.play();
      if(p && typeof p.catch === "function"){
        p.catch(()=>{
          // autoplay blocked or file missing; keep enabled flag but do nothing
        });
      }
    } catch {
      // ignore
    }
  }

  function stopMusic(){
    if(!musicEl) return;
    try {
      musicEl.pause();
      musicEl.currentTime = 0;
    } catch {
      // ignore
    }
  }

  function beep({ freq=440, duration=0.06, type="square", gain=0.06, slideTo=null } = {}){
    if(!sfxEnabled || !ctx) return;

    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if(slideTo){
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + duration);
    }

    // snappy envelope
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(g);
    g.connect(ctx.destination);

    osc.start(t0);
    osc.stop(t0 + duration + 0.01);
  }

  function playEat(){
    beep({ freq: 880, duration: 0.05, type: "square", gain: 0.05, slideTo: 1200 });
    // tiny click
    beep({ freq: 1760, duration: 0.02, type: "triangle", gain: 0.02 });
  }

  function playDie(){
    beep({ freq: 220, duration: 0.18, type: "sawtooth", gain: 0.06, slideTo: 60 });
    setTimeout(() => beep({ freq: 110, duration: 0.20, type: "square", gain: 0.05, slideTo: 40 }), 60);
  }

  return {
    ensureUnlocked,
    playEat,
    playDie,
    // sfx
    setEnabled: setSfxEnabled,
    isEnabled: isSfxEnabled,

    // music
    setMusicEnabled,
    isMusicEnabled,
    setMusicSrc,
    playMusic,
    stopMusic,
  };
}
