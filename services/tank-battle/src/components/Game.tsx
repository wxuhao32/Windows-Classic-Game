import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine } from '../game/GameEngine';
import { GameRenderer } from './GameRenderer';
import { VirtualJoystick } from './VirtualJoystick';
import type { InputState } from '../game/input';
import type { OnlineConfig } from '../App';
import type { ClientToServer, ServerToClient, InputStateNet, RoomMode } from '../shared/protocol';

type Scene = 'menu' | 'game';

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function vecTo4Dir(v: { x: number; y: number }, mag: number) {
  // 优先主轴方向，避免斜向抖动
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const dead = 0.18;
  if (mag < dead) return { up: false, down: false, left: false, right: false };
  if (ax >= ay) {
    return { up: false, down: false, left: v.x < 0, right: v.x > 0 };
  }
  return { up: v.y < 0, down: v.y > 0, left: false, right: false };
}

export const Game: React.FC<{
  mode: 'single' | 'online';
  online: OnlineConfig | null;
  onQuit: () => void;
}> = ({ mode, online, onQuit }) => {
  const engine = useMemo(() => new GameEngine(), []);
  const [statusText, setStatusText] = useState<string>('');
  const [onlineInfo, setOnlineInfo] = useState<{
    roomId: string;
    playerId: string;
    seat: 1 | 2;
    role: 'host' | 'guest';
    mode: RoomMode;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
    const guestInputRef = useRef({ up:false,down:false,left:false,right:false, fire:false, special:false });
  const seqRef = useRef(0);
  const tickRef = useRef(0);
  const lastSnapSentRef = useRef(0);

    const sendGuestInput = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (!onlineInfo || onlineInfo.role !== 'guest') return;
      const seq = ++seqRef.current;
      const input = { ...guestInputRef.current };
      const msg: ClientToServer = { type: 'input', roomId: onlineInfo.roomId, seq, input };
      ws.send(JSON.stringify(msg));
    };

  // 游戏大厅桥接 API
  useEffect(() => {
    (window as any).tankGame = {
      start: () => {},
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      reset: () => {
        engine.reset();
        engine.resume();
      },
      destroy: () => {},
    };
    return () => {
      if ((window as any).tankGame) delete (window as any).tankGame;
    };
  }, [engine]);

  // 页面切到后台自动暂停（避免 iframe 抢占资源）
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) engine.pause();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [engine]);

  // 初始化（单机 / 联机）
  useEffect(() => {
    engine.reset();
    engine.startGame(0);

    if (mode !== 'online' || !online) {
      engine.setMultiplayerEnabled(false);
      setStatusText('战斗中');
      return;
    }

    // 联机：先设置引擎为多人模式（由网络决定 pvp/coop）
    engine.setMultiplayerEnabled(true);
    engine.setMultiplayerMode(online.mode);
    setStatusText('联机连接中…');

    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      const msg: ClientToServer =
        online.action === 'create'
          ? { type: 'create', roomId: online.roomId, password: online.password, nickname: online.nickname, mode: online.mode }
          : { type: 'join', roomId: online.roomId, password: online.password, nickname: online.nickname };
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (ev) => {
      let msg: ServerToClient | null = null;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.type === 'error') {
        setStatusText(`联机失败：${msg.message}`);
        return;
      }

      if (msg.type === 'created' || msg.type === 'joined') {
        setOnlineInfo({ roomId: msg.roomId, playerId: msg.playerId, seat: msg.seat, role: msg.role, mode: msg.mode });
        engine.setMultiplayerEnabled(true);
        engine.setMultiplayerMode(msg.mode);
        setStatusText(msg.mode === 'coop' ? '合作模式：等待队友…' : '对战模式：等待对手…');
        return;
      }

      if (msg.type === 'playerJoined') {
        setStatusText((prev) => (onlineInfo?.mode === 'coop' ? '队友已加入，开始战斗！' : '对手已加入，开始对战！'));
        return;
      }

      if (msg.type === 'playerLeft') {
        setStatusText('对方已离开房间');
        return;
      }

      if (msg.type === 'input') {
        // 房主端接收对方输入
        if (!onlineInfo || onlineInfo.role !== 'host') return;
        const input = msg.input as any;
        // 兼容：只处理 4 方向 + fire/special
        engine.setRemoteInput('up', !!input?.up);
        engine.setRemoteInput('down', !!input?.down);
        engine.setRemoteInput('left', !!input?.left);
        engine.setRemoteInput('right', !!input?.right);
        engine.setRemoteInput('fire', !!input?.fire);
        engine.setRemoteInput('special', !!input?.special);
        return;
      }

      if (msg.type === 'state') {
        // 客人端应用快照
        if (!onlineInfo || onlineInfo.role !== 'guest') return;
        engine.applyNetworkSnapshot(msg.snapshot as any);
        return;
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      try {
        ws.close();
      } catch {}
      wsRef.current = null;
    };
  }, [mode, online, engine]);

  // 房主：定时发送快照；客人：不发送
  useEffect(() => {
    const t = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (!onlineInfo || onlineInfo.role !== 'host') return;
      const now = performance.now();
      // 约 15 fps 的状态同步（可调）
      if (now - lastSnapSentRef.current < 66) return;
      lastSnapSentRef.current = now;

      const snapshot = engine.toNetworkSnapshot();
      tickRef.current += 1;
      const msg: ClientToServer = { type: 'state', roomId: onlineInfo.roomId, tick: tickRef.current, snapshot };
      ws.send(JSON.stringify(msg));
    }, 16);
    return () => window.clearInterval(t);
  }, [engine, onlineInfo]);

  // 虚拟摇杆输入（本地玩家）
  const onJoystick = (st: { move: { x: number; y: number }; magnitude: number }) => {
    const dir = vecTo4Dir(st.move, st.magnitude);
    engine.setInput('up', dir.up);
    engine.setInput('down', dir.down);
    engine.setInput('left', dir.left);
    engine.setInput('right', dir.right);
      // 同步到联机：客人把输入发给房主；房主不用发自己的输入
      sendGuestInput();
    };
  };

  const onFireDown = () => {
      guestInputRef.current.fire = true;
      engine.setInput('fire', true);
      sendGuestInput();
    };
  const onFireUp = () => {
      guestInputRef.current.fire = false;
      engine.setInput('fire', false);
      sendGuestInput();
    };

  const onSpecialDown = () => {
      guestInputRef.current.special = true;
      engine.setInput('special', true);
      sendGuestInput();
    };
  const onSpecialUp = () => {
      guestInputRef.current.special = false;
      engine.setInput('special', false);
      sendGuestInput();
    };

  const quit = () => {
    try {
      wsRef.current?.send(JSON.stringify({ type: 'leave' } satisfies ClientToServer));
    } catch {}
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    onQuit();
  };

  const isGuest = onlineInfo?.role === 'guest';

  return (
    <div className="w-full h-full relative bg-black select-none">
      {/* 画布层（客人端不驱动引擎，只渲染快照） */}
      <GameRenderer engine={engine} driveEngine={!isGuest} />

      {/* 顶部 HUD */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between text-white">
        <div className="text-xs text-white/80">
          {statusText}
          {onlineInfo && (
            <span className="ml-2 text-white/50">
              | 房间 {onlineInfo.roomId} | {onlineInfo.mode === 'coop' ? '合作' : '对战'} | {onlineInfo.role === 'host' ? '房主' : '玩家'}（座位{onlineInfo.seat}）
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => engine.pause()}
            className="px-3 py-1 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 active:scale-[0.98] transition text-sm"
          >
            暂停
          </button>
          <button
            onClick={() => engine.resume()}
            className="px-3 py-1 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 active:scale-[0.98] transition text-sm"
          >
            继续
          </button>
          <button
            onClick={() => { engine.reset(); engine.startGame(0); }}
            className="px-3 py-1 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 active:scale-[0.98] transition text-sm"
          >
            重新开始
          </button>
          <button
            onClick={quit}
            className="px-3 py-1 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 active:scale-[0.98] transition text-sm"
          >
            退出
          </button>
        </div>
      </div>

      {/* 移动端操控 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-3 bottom-3 pointer-events-auto">
          <VirtualJoystick onChange={onJoystick as any} />
        </div>

        <div className="absolute right-3 bottom-3 flex flex-col gap-3 pointer-events-auto">
          <PressButton label="开火" onDown={onFireDown} onUp={onFireUp} />
          <PressButton label="技能" onDown={onSpecialDown} onUp={onSpecialUp} />
        </div>
      </div>
    </div>
  );
};

const PressButton: React.FC<{ label: string; onDown: () => void; onUp: () => void }> = ({ label, onDown, onUp }) => {
  return (
    <button
      className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 hover:bg-white/15 active:scale-[0.98] transition text-white font-semibold"
      onPointerDown={(e) => { e.preventDefault(); onDown(); }}
      onPointerUp={(e) => { e.preventDefault(); onUp(); }}
      onPointerCancel={(e) => { e.preventDefault(); onUp(); }}
    >
      {label}
    </button>
  );
};
