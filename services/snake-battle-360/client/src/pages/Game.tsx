/**
 * 游戏主页面
 * 设计哲学：现代竞技游戏风格，整合游戏逻辑、渲染和控制
 *
 * ✅ 本次优化：
 * - 联机改为「房间号 + 密码（可选）」私密模式，不再自由接管 AI 蛇
 * - 摇杆更跟手（见 VirtualJoystick & gameEngine）
 * - 全屏按钮
 * - Lobby 打开联机蛇默认进入本页的 Home，不再强制跳到 online 画面（wrapper 已处理）
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  GameState,
  initializeGame,
  initializeArena,
  updateGame,
  setPlayerStick,
  togglePause,
} from "@/lib/gameEngine";
import { GameCanvas } from "@/components/GameCanvas";
import { GameInfo } from "@/components/GameInfo";
import { GameControls } from "@/components/GameControls";
import { VirtualJoystick } from "@/components/VirtualJoystick";
import {
  PROTOCOL_VERSION,
  type ClientToServerMessage,
  type ServerToClientMessage,
  type PauseProposal,
  type PauseVote,
} from "@shared/protocol";

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const UPDATE_INTERVAL = 33; // ms（≈30Hz 更丝滑）
const BGM_URL = "/audio/bgm2.mp3";

function buildWsUrl(query: { room?: string; key?: string; name?: string }) {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  let base = env;
  if (!base) {
    if (import.meta.env.DEV) {
      base = `ws://${window.location.hostname}:3001/ws`;
    } else {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      base = `${proto}://${window.location.host}/ws`;
    }
  }

  const u = new URL(base);
  if (query.room) u.searchParams.set("room", query.room);
  if (query.key) u.searchParams.set("key", query.key);
  if (query.name) u.searchParams.set("name", query.name);
  return u.toString();
}

export default function Game() {
  const [, setLocation] = useLocation();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const mode = useMemo(() => (params.get("mode") === "online" ? "online" : "offline"), [params]);

  const roomInfo = useMemo(() => {
    if (mode !== "online") return null;
    const room = (params.get("room") || "public").trim().toUpperCase();
    const key = (params.get("key") || "").trim();
    const name = (params.get("name") || "").trim();
    return { room, key, name };
  }, [mode, params]);

  const inviteLink = useMemo(() => {
    if (!roomInfo) return null;
    const url = new URL(window.location.href);
    url.pathname = "/game";
    url.searchParams.set("mode", "online");
    url.searchParams.set("room", roomInfo.room);
    if (roomInfo.key) url.searchParams.set("key", roomInfo.key);
    url.searchParams.delete("name");
    return url.toString();
  }, [roomInfo]);

  const [gameState, setGameState] = useState<GameState>(() =>
    mode === "online" ? initializeArena(GAME_WIDTH, GAME_HEIGHT, 12) : initializeGame(GAME_WIDTH, GAME_HEIGHT, 10)
  );

  // 联机状态
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const [wsStatus, setWsStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [clientId, setClientId] = useState<string | null>(null);
  const [mySnakeId, setMySnakeId] = useState<string | null>(mode === "offline" ? "player" : null);

  // 暂停投票（联机）
  const [pauseProposal, setPauseProposal] = useState<PauseProposal | null>(null);

  // 全屏
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // BGM
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // SFX：使用 WebAudio 生成（吃/死亡/暴涨提示）
  const sfxCtxRef = useRef<AudioContext | null>(null);
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

  const enableAudio = useCallback(() => {
    // BGM
    const audio = audioRef.current;
    if (audio) {
      audio.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    }
    // SFX ctx
    if (!sfxCtxRef.current) {
      try {
        sfxCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        // ignore
      }
    }
    if (sfxCtxRef.current?.state === "suspended") sfxCtxRef.current.resume().catch(() => null);
  }, []);

  useEffect(() => {
    const audio = new Audio(BGM_URL);
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "auto";
    audioRef.current = audio;

    const shouldAuto = sessionStorage.getItem("snake_autoplay_audio") === "1";
    if (shouldAuto) {
      audio.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    } else {
      setAudioBlocked(true);
    }

    return () => {
      try {
        audio.pause();
        audio.src = "";
      } catch {
        // ignore
      }
      audioRef.current = null;
    };
  }, []);

  // 全屏状态监听
  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    handler();
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => null);
      return;
    }
    el.requestFullscreen?.().catch(() => toast.error("当前浏览器不支持全屏"));
  }, []);

  // 单机：本地 Tick
  useEffect(() => {
    if (mode !== "offline") return;
    const timer = setInterval(() => {
      setGameState((prev) => {
        updateGame(prev, UPDATE_INTERVAL);
        return { ...prev };
      });
    }, UPDATE_INTERVAL);
    return () => clearInterval(timer);
  }, [mode]);

  const sendWs = useCallback((msg: ClientToServerMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  // 联机：连接 WS
  useEffect(() => {
    if (mode !== "online") return;

    let closed = false;
    const ws = new WebSocket(buildWsUrl({ room: roomInfo?.room, key: roomInfo?.key, name: roomInfo?.name }));
    wsRef.current = ws;
    setWsStatus("connecting");

    ws.onopen = () => {
      if (closed) return;
      setWsStatus("connected");
      ws.send(JSON.stringify({ type: "hello", version: PROTOCOL_VERSION } satisfies ClientToServerMessage));
      // 兼容：显式 join（服务端也支持 query 自动 join）
      if (roomInfo) {
        ws.send(
          JSON.stringify({ type: "join", roomId: roomInfo.room, key: roomInfo.key || undefined, name: roomInfo.name || undefined } satisfies ClientToServerMessage)
        );
      }
    };

    ws.onerror = () => {
      if (closed) return;
      setWsStatus("error");
      toast.error("联机连接失败（WS）");
    };

    ws.onmessage = (ev) => {
      const raw = typeof ev.data === "string" ? ev.data : "";
      let msg: ServerToClientMessage | null = null;
      try {
        msg = JSON.parse(raw) as ServerToClientMessage;
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.type === "welcome") {
        setClientId(msg.clientId);
        clientIdRef.current = msg.clientId;
        setGameState(msg.state);
        setMySnakeId(msg.mySnakeId || null);
        return;
      }
      if (msg.type === "state") {
        setGameState(msg.state);
        const cid = clientIdRef.current;
        if (cid) {
          const mine = msg.state.snakes.find((s) => s.controlledBy === cid);
          setMySnakeId(mine?.id || null);
        }
        return;
      }
      if (msg.type === "pause_proposal") {
        setPauseProposal(msg.proposal);
        return;
      }
      if (msg.type === "pause_result") {
        setPauseProposal(null);
        if (msg.accepted) toast.success(msg.action === "pause" ? "已暂停" : "已继续");
        else toast(msg.reason ? `暂停请求未通过：${msg.reason}` : "暂停请求未通过");
        return;
      }
      if (msg.type === "info") {
        toast(msg.message);
        return;
      }
      if (msg.type === "error") {
        toast.error(msg.message);
        return;
      }
    };

    ws.onclose = () => {
      if (closed) return;
      setWsStatus("idle");
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
  }, [mode, roomInfo]);

  // 键盘控制（单机=本地修改；联机=发 input）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      const sendStick = (stick: { x: number; y: number }) => {
        if (mode === "offline") {
          setGameState((prev) => {
            setPlayerStick(prev, stick);
            return prev;
          });
        } else {
          sendWs({ type: "input", stick });
        }
      };

      if (key === "arrowup" || key === "w") sendStick({ x: 0, y: -1 });
      if (key === "arrowdown" || key === "s") sendStick({ x: 0, y: 1 });
      if (key === "arrowleft" || key === "a") sendStick({ x: -1, y: 0 });
      if (key === "arrowright" || key === "d") sendStick({ x: 1, y: 0 });

      if (key === " " || key === "space") {
        e.preventDefault();
        if (mode === "offline") {
          setGameState((prev) => {
            togglePause(prev);
            return prev;
          });
        } else {
          sendWs({ type: "pause_request", action: gameState.isPaused ? "resume" : "pause" });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (
        key === "arrowup" ||
        key === "arrowdown" ||
        key === "arrowleft" ||
        key === "arrowright" ||
        key === "w" ||
        key === "a" ||
        key === "s" ||
        key === "d"
      ) {
        if (mode === "offline") {
          setGameState((prev) => {
            setPlayerStick(prev, { x: 0, y: 0 });
            return prev;
          });
        } else {
          sendWs({ type: "input", stick: { x: 0, y: 0 } });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [mode, sendWs, gameState.isPaused]);

  const handlePauseToggle = useCallback(() => {
    if (mode === "offline") {
      setGameState((prev) => {
        togglePause(prev);
        return prev;
      });
      return;
    }
    sendWs({ type: "pause_request", action: gameState.isPaused ? "resume" : "pause" });
  }, [mode, sendWs, gameState.isPaused]);

  const handleRestart = useCallback(() => {
    if (mode === "online") {
      sendWs({ type: "restart" });
      return;
    }
    setGameState(initializeGame(GAME_WIDTH, GAME_HEIGHT, 10));
  }, [mode, sendWs]);

  const handleHome = useCallback(() => setLocation("/"), [setLocation]);

  const myPlayerName = useMemo(() => {
    if (!mySnakeId) return null;
    const s = gameState.snakes.find((x) => x.id === mySnakeId);
    return s?.playerName || null;
  }, [gameState.snakes, mySnakeId]);

  const handleStick = useCallback(
    (stick: { x: number; y: number }) => {
      if (mode === "offline") {
        setGameState((prev) => {
          setPlayerStick(prev, stick);
          return prev;
        });
      } else {
        sendWs({ type: "input", stick });
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
      sendWs({ type: "pause_vote", requestId: pauseProposal.requestId, vote });
    },
    [pauseProposal, sendWs]
  );

  const copyInvite = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("邀请链接已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }, [inviteLink]);

  // 轻量的吃食物提示：当自己的蛇长度上升就播放一下
  const lastLenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!mySnakeId) return;
    const s = gameState.snakes.find((x) => x.id === mySnakeId);
    if (!s) return;
    if (lastLenRef.current == null) {
      lastLenRef.current = s.length;
      return;
    }
    const delta = s.length - lastLenRef.current;
    if (delta > 0.1) playSfx(delta > 18 ? "big" : "eat");
    lastLenRef.current = s.length;
  }, [gameState.snakes, mySnakeId, playSfx]);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden min-h-[100dvh] text-[#e0e0e0] p-3 md:p-6 pb-36 md:pb-6"
      style={{
        backgroundImage: `url(/background/1.png)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#0f1419",
      }}
    >
      {/* UI 叠一层暗色，避免背景影响可读性 */}
      <div className="absolute inset-0 bg-[#0f1419]/70 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">
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
              style={{ touchAction: "manipulation" }}
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
                {pauseProposal.requestedByName} 想要{pauseProposal.action === "pause" ? "暂停" : "继续"}游戏
              </div>
              <div className="text-xs text-[#a0a0a0] mb-3">需要所有真人玩家同意才会生效（15 秒超时）</div>

              <div className="space-y-2 mb-4">
                {pauseProposal.eligible.map((p) => (
                  <div key={p.clientId} className="flex items-center justify-between text-sm border border-[#404854] rounded-lg px-3 py-2">
                    <div className="text-[#e0e0e0]">{p.playerName}</div>
                    <div className="text-xs">
                      {pauseProposal.votes[p.clientId] === "accept" && <span className="text-[#00ff88]">同意</span>}
                      {pauseProposal.votes[p.clientId] === "reject" && <span className="text-[#ff3333]">拒绝</span>}
                      {pauseProposal.votes[p.clientId] == null && <span className="text-[#a0a0a0]">等待</span>}
                    </div>
                  </div>
                ))}
              </div>

              {isEligibleToVote ? (
                <div className="flex gap-3">
                  <button
                    className="flex-1 px-3 py-2 rounded-lg bg-[#00ff88] text-[#0f1419] font-bold disabled:opacity-50"
                    disabled={myVote === "accept"}
                    onClick={() => sendVote("accept")}
                  >
                    同意
                  </button>
                  <button
                    className="flex-1 px-3 py-2 rounded-lg bg-[#ff3333] text-white font-bold disabled:opacity-50"
                    disabled={myVote === "reject"}
                    onClick={() => sendVote("reject")}
                  >
                    拒绝
                  </button>
                </div>
              ) : (
                <div className="text-center text-xs text-[#a0a0a0]">你不是本次投票的参与者</div>
              )}
            </div>
          </div>
        )}

        {/* 标题 */}
        <div className="text-center mb-8">
          <h1
            className="text-4xl md:text-5xl font-black text-[#00ff88] mb-2 tracking-widest"
            style={{ textShadow: "0 0 20px rgba(0, 255, 136, 0.5)" }}
          >
            SNAKE BATTLE
          </h1>
          <p className="text-[#a0a0a0] uppercase tracking-wider text-sm">
            {mode === "online"
              ? `联机房间：${roomInfo?.room || "public"} · 摇杆/键盘控制 · 空格/按钮发起暂停投票`
              : "使用方向键或 WASD 控制蛇 · 空格暂停"}
          </p>
        </div>

        {/* 联机信息面板 */}
        {mode === "online" && (
          <div className="bg-[#1a1f2e] border-2 border-[#00ffff] rounded-lg p-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-sm text-[#a0a0a0]">
                <span className="text-[#00ffff] font-bold">联机状态：</span>
                <span className={wsStatus === "connected" ? "text-[#00ff88]" : "text-[#ff6600]"}>{wsStatus}</span>
                {clientId ? <span className="ml-3">ID: {clientId.slice(0, 6)}</span> : null}
              </div>
              <div className="text-sm text-[#a0a0a0]">
                <span className="text-[#00ffff] font-bold">我的蛇：</span>
                <span className="text-[#e0e0e0]">{mySnakeId ? `${mySnakeId}${myPlayerName ? `（${myPlayerName}）` : ""}` : "连接中..."}</span>
              </div>
            </div>

            {inviteLink && (
              <div className="mt-3 flex flex-col md:flex-row gap-2 md:items-center">
                <div className="text-xs text-[#a0a0a0] break-all font-mono flex-1">{inviteLink}</div>
                <button
                  onClick={copyInvite}
                  className="px-3 py-2 rounded-lg border border-[#404854] bg-[#0f1419] hover:bg-[#0f1419]/70 text-sm"
                >
                  复制邀请链接
                </button>
              </div>
            )}
          </div>
        )}

        {/* 游戏画布 */}
        <div className="flex justify-center mb-6">
          <GameCanvas gameState={gameState} mySnakeId={mySnakeId} />
        </div>

        {/* 游戏信息 */}
        <div className="mb-6">
          <GameInfo gameState={gameState} mySnakeId={mySnakeId} />
        </div>

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

        {/* 游戏说明（桌面展示） */}
        <div className="bg-[#1a1f2e] border-2 border-[#404854] rounded-lg p-4 md:p-6 mt-8 hidden md:block">
          <h2 className="text-[#00ff88] font-bold text-lg mb-4 uppercase tracking-wider">游戏规则</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-[#a0a0a0]">
            <div>
              <p className="text-[#00ffff] font-bold mb-2">🎮 基本操作</p>
              <ul className="space-y-1">
                <li>• 移动端：双侧摇杆（左/右任选）</li>
                <li>• 桌面：方向键或 WASD</li>
                <li>• 空格：暂停/继续（联机为投票）</li>
                <li>• 全屏按钮：沉浸式游玩</li>
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

      {/* 手机：双摇杆（左右都可用，满足左手/右手习惯） */}
      <VirtualJoystick side="left" onStick={handleStick} />
      <VirtualJoystick side="right" onStick={handleStick} />
    </div>
  );
}
