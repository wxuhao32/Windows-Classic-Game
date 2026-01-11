/**
 * 游戏主页面
 * 设计哲学：现代竞技游戏风格，整合游戏逻辑、渲染和控制
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  GameState,
  initializeGame,
  initializeArena,
  updateGame,
  setPlayerStick,
  togglePause,
} from '@/lib/gameEngine';
import { GameCanvas } from '@/components/GameCanvas';
import { GameInfo } from '@/components/GameInfo';
import { GameControls } from '@/components/GameControls';
import { VirtualJoystick } from '@/components/VirtualJoystick';
import {
  PROTOCOL_VERSION,
  type ClientToServerMessage,
  type ServerToClientMessage,
  type PauseProposal,
  type PauseVote,
} from '@shared/protocol';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const UPDATE_INTERVAL = 50; // 毫秒（更丝滑）
const BGM_URL = '/audio/bgm2.mp3';

function getWsUrl() {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  if (import.meta.env.DEV) {
    // 开发：前端 Vite 默认 3000；WS 后端默认 3001
    return `ws://${window.location.hostname}:3001/ws`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

export default function Game() {
  const [, setLocation] = useLocation();

  const gameRootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);


  const mode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'online' ? 'online' : 'offline';
  }, []);

  const [gameState, setGameState] = useState<GameState>(() =>
    mode === 'online'
      ? initializeArena(GAME_WIDTH, GAME_HEIGHT, 4)
      : initializeGame(GAME_WIDTH, GAME_HEIGHT, 10)
  );

  // 联机状态
  const wsRef = useRef<WebSocket | null>(null);
  const myStickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastInputSentAtRef = useRef<number>(0);
  const pendingInputRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const inputRafRef = useRef<number | null>(null);

  const clientIdRef = useRef<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [clientId, setClientId] = useState<string | null>(null);
  const [mySnakeId, setMySnakeId] = useState<string | null>(mode === 'offline' ? 'player' : null);

  // 暂停投票（联机）
  const [pauseProposal, setPauseProposal] = useState<PauseProposal | null>(null);

const hud = useMemo(() => {
  const totalCount = gameState.snakes.length;
  const alive = gameState.snakes.filter((s) => s.isAlive);
  const aliveCount = alive.length;

  let my = mySnakeId ? gameState.snakes.find((s) => s.id === mySnakeId) : undefined;
  if (!my && clientIdRef.current) {
    my = gameState.snakes.find((s) => s.controlledBy === clientIdRef.current) || undefined;
  }
  const myLength = Math.round(my?.length || 0);

  const aliveSorted = [...alive].sort((a, b) => (b.length || 0) - (a.length || 0));
  const totalAlive = aliveSorted.length || 1;
  const idx = my ? aliveSorted.findIndex((s) => s.id === my!.id) : -1;
  const rank = idx >= 0 ? idx + 1 : totalAlive;

  return { totalCount, aliveCount, rank, totalAlive, myLength };
}, [gameState, mySnakeId]);

const { totalCount, aliveCount, rank, totalAlive, myLength } = hud;


  // BGM（用户可放置 client/public/audio/bgm2.mp3）
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // SFX：不依赖外部素材，使用 WebAudio 生成（吃/死亡/暴涨提示）
  const sfxCtxRef = useRef<AudioContext | null>(null);

// Fullscreen API: hides browser UI when supported (Android/desktop). iOS may be limited.
useEffect(() => {
  const onFs = () => {
    const fs = !!document.fullscreenElement;
    setIsFullscreen(fs);
    document.body.style.overflow = fs ? "hidden" : "";
  };
  document.addEventListener("fullscreenchange", onFs);
  return () => {
    document.removeEventListener("fullscreenchange", onFs);
    document.body.style.overflow = "";
  };
}, []);

const toggleFullscreen = useCallback(async () => {
  try {
    if (!document.fullscreenElement) {
      const el = gameRootRef.current ?? document.documentElement;
      // @ts-ignore
      await el.requestFullscreen?.({ navigationUI: "hide" });
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // ignore
  }
}, []);

  const playSfx = useCallback(
    (kind: "eat" | "big" | "death") => {
      const ctx = sfxCtxRef.current;
      if (!ctx || audioBlocked) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (kind === "death") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.22);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      } else if (kind === "big") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(760, now + 0.1);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      } else {
        osc.type = "sine";
        osc.frequency.setValueAtTime(560, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.05);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + (kind === "death" ? 0.25 : kind === "big" ? 0.15 : 0.08));
    },
    [audioBlocked]
  );

  useEffect(() => {
    const audio = new Audio(BGM_URL);
    audio.loop = true;
    // 手机上音量太大容易刺耳，这里默认稍微收敛点
    audio.volume = 0.35;
    audio.preload = 'auto';
    audioRef.current = audio;

    const shouldAuto = sessionStorage.getItem('snake_autoplay_audio') === '1';
    if (shouldAuto) {
      audio.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    } else {
      setAudioBlocked(true);
    }

    return () => {
      try {
        audio.pause();
        // 释放资源
        audio.src = '';
      } catch {
        // ignore
      }
      audioRef.current = null;
    };
  }, []);

  // 暂停时同步暂停 BGM（若用户已允许播放）
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (gameState.isPaused) {
      audio.pause();
    } else {
      // 只有在用户允许后才尝试继续播放
      if (!audioBlocked) {
        audio.play().catch(() => {
          // 可能因为浏览器策略被阻止
          setAudioBlocked(true);
        });
      }
    }
  }, [gameState.isPaused, audioBlocked]);

  const enableAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Create/resume WebAudio context for SFX (must be user gesture)
    if (!sfxCtxRef.current) {
      try {
        sfxCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        // ignore
      }
    }
    sfxCtxRef.current?.resume().catch(() => void 0);
    audio.play()
      .then(() => {
        setAudioBlocked(false);
        sessionStorage.setItem('snake_autoplay_audio', '1');
      })
      .catch(() => {
        toast.error('浏览器阻止了自动播放，请再点一次或检查静音/音量设置');
      });
  }, []);

  // SFX hooks (based on state diffs)
  const prevLenRef = useRef<number | null>(null);
  const prevAliveRef = useRef<boolean | null>(null);
  useEffect(() => {
    const meId = mode === "offline" ? "player" : mySnakeId;
    if (!meId) return;
    const me = gameState.snakes.find((s) => s.id === meId);
    if (!me) return;

    if (prevAliveRef.current === true && me.isAlive === false) {
      playSfx("death");
      if ("vibrate" in navigator) {
        try { (navigator as any).vibrate([70, 30, 40]); } catch { /* ignore */ }
      }
    }

    if (prevLenRef.current != null && me.isAlive) {
      const delta = me.length - prevLenRef.current;
      if (delta > 2) {
        playSfx(delta > 80 ? "big" : "eat");
      }
    }

    prevLenRef.current = me.length;
    prevAliveRef.current = me.isAlive;
  }, [gameState.snakes, mySnakeId, mode, playSfx]);
  // 单机：游戏更新循环
  useEffect(() => {
    if (mode !== 'offline') return;
    const interval = setInterval(() => {
      setGameState((prevState) => {
        const newState = { ...prevState };
        updateGame(newState, UPDATE_INTERVAL);
        return newState;
      });
    }, UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [mode]);

  // 联机：连接 WS
  useEffect(() => {
    if (mode !== 'online') return;

    let closed = false;
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room') || 'public';
    const key = params.get('key') || '';
    const name = params.get('name') || '';
    const u = new URL(getWsUrl());
    u.searchParams.set('room', room);
    if (key) u.searchParams.set('key', key);
    if (name) u.searchParams.set('name', name);
    const ws = new WebSocket(u.toString());
    wsRef.current = ws;
    setWsStatus('connecting');

    ws.onopen = () => {
      if (closed) return;
      setWsStatus('connected');
      const hello: ClientToServerMessage = { type: 'hello', version: PROTOCOL_VERSION };
      ws.send(JSON.stringify(hello));
    };

    ws.onerror = () => {
      if (closed) return;
      setWsStatus('error');
      toast.error('联机连接失败（WS）');
    };

    ws.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : '';
      let msg: ServerToClientMessage | null = null;
      try {
        msg = JSON.parse(raw) as ServerToClientMessage;
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.type === 'welcome') {
        setClientId(msg.clientId);
        clientIdRef.current = msg.clientId;
        setGameState(msg.state);
        setMySnakeId(msg.mySnakeId || null);
        setWsStatus('connected');
        return;
      }
if (msg.type === 'state') {
        setGameState(msg.state);
        // Fallback: if for some reason we missed welcome
        setMySnakeId((prev) => {
          if (prev) return prev;
          const mine = msg.state.snakes.find((s) => s.controlledBy === clientIdRef.current);
          return mine?.id || null;
        });
        return;
      }
if (msg.type === 'pause_proposal') {
        setPauseProposal(msg.proposal);
        return;
      }
      if (msg.type === 'pause_result') {
        setPauseProposal(null);
        if (msg.accepted) {
          toast.success(msg.action === 'pause' ? '已暂停' : '已继续');
        } else {
          toast(msg.reason ? `暂停请求未通过：${msg.reason}` : '暂停请求未通过');
        }
        return;
      }
      if (msg.type === 'info') {
        toast(msg.message);
        return;
      }
      if (msg.type === 'error') {
        toast.error(msg.message);
        return;
      }
    };

    ws.onclose = () => {
      if (closed) return;
      setWsStatus('idle');
      setPauseProposal(null);
    };

    return () => {
      closed = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    };
  }, [mode]);

  const sendWs = useCallback((msg: ClientToServerMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  // 键盘控制（单机=本地修改；联机=发 input）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      const sendStick = (stick: { x: number; y: number }) => {
        if (mode === 'offline') {
          setGameState((prev) => {
            setPlayerStick(prev, stick);
            return prev;
          });
        } else {
          sendWs({ type: 'input', stick });
        }
      };

      switch (key) {
        case 'arrowup':
        case 'w':
          e.preventDefault();
          sendStick({ x: 0, y: -1 });
          break;
        case 'arrowdown':
        case 's':
          e.preventDefault();
          sendStick({ x: 0, y: 1 });
          break;
        case 'arrowleft':
        case 'a':
          e.preventDefault();
          sendStick({ x: -1, y: 0 });
          break;
        case 'arrowright':
        case 'd':
          e.preventDefault();
          sendStick({ x: 1, y: 0 });
          break;
        case ' ':
          e.preventDefault();
          if (mode === 'offline') {
            setGameState((prev) => {
              togglePause(prev);
              return prev;
            });
          } else {
            // 联机：发起暂停/继续投票
            sendWs({ type: 'pause_request', action: gameState.isPaused ? 'resume' : 'pause' });
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        // 回中立（不再施加额外转向）
        if (mode === 'offline') {
          setGameState((prev) => {
            setPlayerStick(prev, { x: 0, y: 0 });
            return prev;
          });
        } else {
          sendWs({ type: 'input', stick: { x: 0, y: 0 } });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [mode, sendWs, gameState.isPaused]);

  const handlePauseToggle = useCallback(() => {
    if (mode === 'offline') {
      setGameState((prev) => {
        togglePause(prev);
        return prev;
      });
      return;
    }
    sendWs({ type: 'pause_request', action: gameState.isPaused ? 'resume' : 'pause' });
  }, [mode, sendWs, gameState.isPaused]);

  const handleRestart = useCallback(() => {
    if (mode === 'online') {
      sendWs({ type: 'restart' });
      return;
    }
    setGameState(initializeGame(GAME_WIDTH, GAME_HEIGHT, 10));
  }, [mode, sendWs]);

  const handleHome = useCallback(() => {
    setLocation('/');
  }, [setLocation]);

    const myPlayerName = useMemo(() => {
    if (!mySnakeId) return null;
    const s = gameState.snakes.find((x) => x.id === mySnakeId);
    return s?.playerName || null;
  }, [gameState.snakes, mySnakeId]);

    const handleStick = useCallback(
    (stick: { x: number; y: number }) => {
      myStickRef.current = stick;

      if (mode === 'offline') {
        setGameState((prev) => {
          setPlayerStick(prev, stick);
          return prev;
        });
        return;
      }

      // Online: throttle input sending (~25Hz) to reduce jank / GC
      pendingInputRef.current = stick;

      const flush = () => {
        inputRafRef.current = null;
        const now = performance.now();
        if (now - lastInputSentAtRef.current < 40) return; // 25Hz
        lastInputSentAtRef.current = now;
        sendWs({ type: 'input', stick: pendingInputRef.current });
      };

      if (inputRafRef.current == null) {
        inputRafRef.current = requestAnimationFrame(flush);
      }
    },
    [mode, sendWs]
  );

  const isEligibleToVote = useMemo(() => {
    if (!pauseProposal || !clientId) return false;
    return pauseProposal.eligible.some((e) => e.clientId === clientId);
  }, [pauseProposal, clientId]);

  const myVote = useMemo(() => {
    if (!pauseProposal || !clientId) return null;
    return pauseProposal.votes[clientId] ?? null;
  }, [pauseProposal, clientId]);

  const sendVote = useCallback(
    (vote: PauseVote) => {
      if (!pauseProposal) return;
      sendWs({ type: 'pause_vote', requestId: pauseProposal.requestId, vote });
    },
    [pauseProposal, sendWs]
  );

  return (
    <div ref={gameRootRef}
      className={`relative overflow-hidden min-h-[100dvh] text-[#e0e0e0] p-3 md:p-6 ${isFullscreen ? "pb-0" : "pb-36"} md:pb-6`}
      style={{
        backgroundImage: `url(/background/1.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#0f1419',
      }}
    >
      {/* UI 叠一层暗色，避免背景影响可读性 */}
      <div className="absolute inset-0 bg-[#0f1419]/70 pointer-events-none" />
      <div className="relative">
      <div className="max-w-6xl mx-auto">
        {/* 音乐提示 */}
        {audioBlocked && (
          <div className="mb-4 flex justify-center">
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                enableAudio();
              }}
              onClick={(e) => {
                e.preventDefault();
                enableAudio();
              }}
              className="px-4 py-2 rounded-lg border border-white/20 bg-white/10 backdrop-blur text-white/90 text-sm"
              style={{ touchAction: 'manipulation' }}
            >
              🎵 开启音乐
            </button>
          </div>
        )}

        {/* 联机暂停投票 */}
        {pauseProposal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" />
            <div className="relative w-full max-w-md bg-[#1a1f2e] border-2 border-[#00ffff] rounded-xl p-4 shadow-xl">
              <div className="text-[#00ffff] font-bold mb-2">
                {pauseProposal.requestedByName} 想要{pauseProposal.action === 'pause' ? '暂停' : '继续'}游戏
              </div>
              <div className="text-xs text-[#a0a0a0] mb-3">
                需要所有真人玩家同意才会生效（15 秒超时）
              </div>

              <div className="space-y-2 mb-4">
                {pauseProposal.eligible.map((p) => (
                  <div key={p.clientId} className="flex items-center justify-between text-sm border border-[#404854] rounded-lg px-3 py-2">
                    <div className="text-[#e0e0e0]">{p.playerName}</div>
                    <div className="text-xs">
                      {pauseProposal.votes[p.clientId] === 'accept' && <span className="text-[#00ff88]">同意</span>}
                      {pauseProposal.votes[p.clientId] === 'reject' && <span className="text-[#ff3333]">拒绝</span>}
                      {pauseProposal.votes[p.clientId] == null && <span className="text-[#a0a0a0]">等待</span>}
                    </div>
                  </div>
                ))}
              </div>

              {isEligibleToVote ? (
                <div className="flex gap-3">
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault();
                      sendVote('accept');
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      sendVote('accept');
                    }}
                    className="flex-1 py-2 rounded-lg bg-[#00ff88] text-[#0f1419] font-bold"
                    style={{ touchAction: 'manipulation' }}
                    disabled={myVote === 'accept'}
                  >
                    同意
                  </button>
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault();
                      sendVote('reject');
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      sendVote('reject');
                    }}
                    className="flex-1 py-2 rounded-lg bg-[#ff3333] text-[#0f1419] font-bold"
                    style={{ touchAction: 'manipulation' }}
                    disabled={myVote === 'reject'}
                  >
                    拒绝
                  </button>
                </div>
              ) : (
                <div className="text-xs text-[#a0a0a0]">你当前未接管蛇（观战中），无需投票。</div>
              )}
            </div>
          </div>
        )}
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-black text-[#00ff88] mb-2 tracking-widest" style={{
            textShadow: '0 0 20px rgba(0, 255, 136, 0.5)',
          }}>
            SNAKE BATTLE
          </h1>
          <p className="text-[#a0a0a0] uppercase tracking-wider text-sm">
            {mode === 'online'
              ? '联机模式：请选择一条 AI 蛇接管 · 方向键/WASD 或虚拟按键控制 · 空格/按钮可发起暂停投票'
              : '使用方向键或 WASD 控制蛇 · 空格暂停'}
          </p>
        </div>

        {/* 联机信息面板 */}
        {mode === 'online' && (
          <div className="bg-[#1a1f2e] border-2 border-[#00ffff] rounded-lg p-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm text-[#a0a0a0]">
                <span className="text-[#00ffff] font-bold">联机状态：</span>
                <span className={wsStatus === 'connected' ? 'text-[#00ff88]' : 'text-[#ff6600]'}>
                  {wsStatus}
                </span>
                {clientId ? <span className="ml-3">ID: {clientId.slice(0, 6)}</span> : null}
              </div>
              <div className="text-sm text-[#a0a0a0]">
                <span className="text-[#00ffff] font-bold">我的蛇：</span>
                <span className="text-[#e0e0e0]">
                  {mySnakeId ? `${mySnakeId}${myPlayerName ? `（${myPlayerName}）` : ''}` : '未接管'}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[#a0a0a0] text-xs uppercase tracking-wider mb-2">
                联机规则
              </div>
              <div className="text-sm text-white/80 leading-relaxed">
                每位玩家进入房间后会<strong className="text-[#00ffff]">自动分配 1 条蛇</strong>（固定 4 条蛇同场）。
                当房间人数不足时，空位由 AI 接管，不会出现外部玩家自由接管干扰。
              </div>
            </div>

            </div>
        )}

{/* 游戏画布（HUD/摇杆均叠加在场地上，避免全屏布局混乱） */}
<div className="flex justify-center mb-6">
  <div className="relative w-full max-w-[980px]">
    <GameCanvas gameState={gameState} mySnakeId={mySnakeId} myStickRef={myStickRef} />
    {/* HUD：左上角小字高透明度 */}
    <div
      className="absolute left-3 top-3 text-[11px] leading-4 text-white/70 bg-black/25 rounded px-2 py-1"
      style={{ pointerEvents: "none" }}
    >
      <div>存活：{aliveCount}/{totalCount}</div>
      <div>排名：{rank}/{totalAlive}</div>
      <div>长度：{myLength}</div>
    </div>
  </div>
</div>

        {/* 游戏信息（全屏时隐藏，避免挤压场地） */}
        {!isFullscreen && (
          <div className="mb-6">
            <GameInfo gameState={gameState} mySnakeId={mySnakeId} />
          </div>
        )}

        {/* 游戏控制 */}
        <div className="mb-6">
          <GameControls
            gameState={gameState}
            onPauseToggle={handlePauseToggle}
            onRestart={handleRestart}
            onHome={handleHome}
            onFullscreenToggle={toggleFullscreen}
            isFullscreen={isFullscreen}
            hidePause={false}
          />
        </div>

        {/* 游戏说明 */}
        <div className="bg-[#1a1f2e] border-2 border-[#404854] rounded-lg p-4 md:p-6 mt-8 hidden md:block">
          <h2 className="text-[#00ff88] font-bold text-lg mb-4 uppercase tracking-wider">游戏规则</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-[#a0a0a0]">
            <div>
              <p className="text-[#00ffff] font-bold mb-2">🎮 基本操作</p>
              <ul className="space-y-1">
                <li>• 鼠标/触控：移动到屏幕外侧可更快转向（移动端用摇杆）</li>
                <li>• 方向键或 WASD：简易转向（桌面）</li>
                <li>• 空格：暂停/继续游戏</li>
                <li>• 点击按钮：重新开始或返回主菜单</li>
              </ul>
            </div>
            <div>
              <p className="text-[#ff00ff] font-bold mb-2">🎯 游戏目标</p>
              <ul className="space-y-1">
                <li>• 吃掉发光食物粒子增加长度</li>
                <li>• 撞墙 / 蛇头碰到其他蛇身体会立刻死亡</li>
                <li>• 死亡会爆成一堆食物，吃掉可获得对方长度约 1/3~1/4 的收益</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

        )}

      {/* 手机：单摇杆（左手） */}
      <VirtualJoystick side="left" onStick={handleStick} />
      </div>
    </div>
  );
}