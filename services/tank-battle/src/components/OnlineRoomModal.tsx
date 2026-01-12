import React, { useMemo, useState } from 'react';
import type { RoomMode } from '../shared/protocol';

export interface OnlineRoomResult {
  action: 'create' | 'join';
  roomId: string;
  password: string;
  nickname: string;
  mode: RoomMode;
}

export const OnlineRoomModal: React.FC<{
  onClose: () => void;
  onSubmit: (r: OnlineRoomResult) => void;
}> = ({ onClose, onSubmit }) => {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [mode, setMode] = useState<RoomMode>('pvp');

  const roomPlaceholder = useMemo(() => {
    const n = Math.floor(Math.random() * 9000 + 1000);
    return String(n);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold">联机对战</div>
          <button onClick={onClose} className="text-white/70 hover:text-white">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs text-white/60 mb-1">模式</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('pvp')}
                className={`rounded-lg border px-3 py-2 text-sm transition active:scale-[0.98] ${
                  mode === 'pvp' ? 'bg-white/12 border-white/30' : 'bg-white/5 border-white/10 hover:bg-white/8'
                }`}
              >
                对战（PVP）
              </button>
              <button
                type="button"
                onClick={() => setMode('coop')}
                className={`rounded-lg border px-3 py-2 text-sm transition active:scale-[0.98] ${
                  mode === 'coop' ? 'bg-white/12 border-white/30' : 'bg-white/5 border-white/10 hover:bg-white/8'
                }`}
              >
                合作（CO-OP）
              </button>
            </div>
            <div className="mt-1 text-[11px] text-white/45 leading-relaxed">
              {mode === 'pvp'
                ? '两人互相对战，击毁对方获胜。'
                : '两人合作打 AI，一起通关。'}
            </div>
          </div>

          <div>
            <div className="text-xs text-white/60 mb-1">房间号</div>
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder={roomPlaceholder}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>
          <div>
            <div className="text-xs text-white/60 mb-1">房间密码（用于验证）</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="例如：123456"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>
          <div>
            <div className="text-xs text-white/60 mb-1">昵称</div>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="最多 16 字"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 outline-none focus:border-white/30"
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => onSubmit({ action: 'create', roomId: roomId || roomPlaceholder, password, nickname, mode })}
            className="rounded-xl bg-emerald-500/90 hover:bg-emerald-500 px-4 py-2 font-semibold active:scale-[0.98] transition"
          >
            创建房间
          </button>
          <button
            onClick={() => onSubmit({ action: 'join', roomId: roomId || roomPlaceholder, password, nickname, mode })}
            className="rounded-xl bg-sky-500/90 hover:bg-sky-500 px-4 py-2 font-semibold active:scale-[0.98] transition"
          >
            加入房间
          </button>
        </div>

        <div className="mt-3 text-xs text-white/50 leading-relaxed">
          • 房间最多 2 人。<br />
          • 密码用于验证加入房间。<br />
          • 房主推进游戏并同步状态；另一位玩家看到同步画面（可能有轻微延迟）。<br />
        </div>
      </div>
    </div>
  );
};
