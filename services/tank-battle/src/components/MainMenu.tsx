// Main Menu Component

import React, { useState, useEffect } from 'react';

interface MainMenuProps {
  onStartGame: () => void;
  onOpenSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStartGame, onOpenSettings }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [blink, setBlink] = useState(true);
  const [showMultiplayerModal] = useState(false);

  const menuItems = ['开始游戏', '设置'];

  useEffect(() => {
    const interval = setInterval(() => setBlink(b => !b), 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showMultiplayerModal) {
        if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') {
          setShowMultiplayerModal(false);
        }
        return;
      }

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          setSelectedIndex(i => (i - 1 + menuItems.length) % menuItems.length);
          break;
        case 'ArrowDown':
        case 'KeyS':
          setSelectedIndex(i => (i + 1) % menuItems.length);
          break;
        case 'Enter':
          if (selectedIndex === 0) onStartGame();
          else if (selectedIndex === 1) onOpenSettings();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, showMultiplayerModal]);

  const handleSelect = (index: number) => {
    switch (index) {
      case 0:
        onStartGame();
        break;
      case 1:
        setShowMultiplayerModal(true);
        break;
      case 2:
        onOpenSettings();
        break;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black flex flex-col items-center justify-center"
      style={{ fontFamily: '"Press Start 2P", monospace' }}
    >
      {/* Title */}
      <div className="mb-16">
        <h1 
          className="text-white text-center leading-tight"
          style={{ fontSize: 28 }}
        >
          <span className="text-yellow-400">TANK</span>
          <br />
          <span className="text-green-400">BATTLE</span>
        </h1>
        <p className="text-gray-500 text-center mt-4" style={{ fontSize: 10 }}>
          2026
        </p>
      </div>

      {/* Menu Items */}
      <div className="flex flex-col gap-4 items-start">
        {menuItems.map((item, index) => (
          <button
            key={item}
            onClick={() => handleSelect(index)}
            className={`flex items-center gap-4 text-white hover:text-yellow-400 transition-colors ${
              selectedIndex === index ? 'text-yellow-400' : ''
            }`}
            style={{ fontSize: 14 }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="w-8">
              {selectedIndex === index && blink ? '>' : ' '}
            </span>
            {item}
          </button>
        ))}
      </div>

      {/* Controls hint */}
      <div 
        className="absolute bottom-8 text-gray-600 text-center"
        style={{ fontSize: 8 }}
      >
        <p>ARROWS/WASD - MOVE</p>
        <p>SPACE/J - FIRE</p>
        <p>ESC/P - PAUSE</p>
      </div>

      {/* Copyright */}
      <p 
        className="absolute bottom-4 text-gray-700"
        style={{ fontSize: 8 }}
      >
        MINIMAX CORP 2026
      </p>

      {/* Multiplayer Modal */}
      {showMultiplayerModal && (
        <div 
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
          onClick={() => setShowMultiplayerModal(false)}
        >
          <div 
            className="bg-gray-900 border-4 border-white/40 p-8 text-center"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-white mb-4" style={{ fontSize: 14 }}>
              双人模式 MODE
            </h2>
            <p className="text-yellow-400 mb-6" style={{ fontSize: 12 }}>
              敬请期待!
            </p>
            <button
              onClick={() => setShowMultiplayerModal(false)}
              className="px-4 py-2 border-2 border-white/40 text-white hover:bg-white/20"
              style={{ fontSize: 10 }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
