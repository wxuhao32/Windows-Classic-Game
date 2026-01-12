import React, { useState } from 'react';
import { OnlineRoomModal, type OnlineRoomResult } from './OnlineRoomModal';

interface MainMenuProps {
  onStartGame: () => void;
  onStartOnline: (r: OnlineRoomResult) => void;
  onOpenSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartGame, onStartOnline, onOpenSettings }) => {
  const [showOnline, setShowOnline] = useState(false);

  return (
    <div className="w-full h-full flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-10">
          <div className="text-3xl font-extrabold tracking-wider">坦克大战</div>
          <div className="mt-2 text-white/50 text-sm">科技·军事风 / iframe 友好 / 可联机扩展</div>
        </div>

        <div className="flex flex-col gap-3">
          <MenuButton onClick={onStartGame}>开始游戏</MenuButton>
          <MenuButton onClick={() => setShowOnline(true)}>联机对战</MenuButton>
          <MenuButton onClick={onOpenSettings}>设置</MenuButton>
        </div>

        <div className="mt-10 text-center text-xs text-white/45">
          提示：移动端使用左侧摇杆移动，右侧按钮开火/技能；大厅可通过 window.tankGame 控制暂停/继续。
        </div>
      </div>

      {showOnline && (
        <OnlineRoomModal
          onClose={() => setShowOnline(false)}
          onSubmit={(r) => {
            setShowOnline(false);
            onStartOnline(r);
          }}
        />
      )}
    </div>
  );
};

const MenuButton: React.FC<React.PropsWithChildren<{ onClick: () => void }>> = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="w-full rounded-2xl bg-white/6 border border-white/10 hover:bg-white/10 px-6 py-3 font-semibold
      active:scale-[0.98] transition"
  >
    {children}
  </button>
);
