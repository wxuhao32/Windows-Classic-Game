// 设置 Component

import React, { useState } from 'react';

interface 设置Props {
  on返回: () => void;
}

export const 设置: React.FC<设置Props> = ({ on返回 }) => {
  const [soundEnabled, set音效Enabled] = useState(true);
  const [musicEnabled, set音乐Enabled] = useState(true);

  return (
    <div 
      className="fixed inset-0 bg-black flex flex-col items-center justify-center"
      style={{ fontFamily: '"Press Start 2P", monospace' }}
    >
      <h1 className="text-white mb-12" style={{ fontSize: 20 }}>
        SETTINGS
      </h1>

      <div className="flex flex-col gap-6 mb-12">
        <SettingToggle
          label="SOUND"
          value={soundEnabled}
          onChange={set音效Enabled}
        />
        <SettingToggle
          label="MUSIC"
          value={musicEnabled}
          onChange={set音乐Enabled}
        />
      </div>

      <button
        onClick={on返回}
        className="px-6 py-3 text-white border-2 border-white/40 hover:bg-white/20"
        style={{ fontSize: 12 }}
      >
        BACK
      </button>

      <div 
        className="absolute bottom-8 text-gray-600 text-center"
        style={{ fontSize: 8 }}
      >
        <p>KEYBOARD C开TROLS:</p>
        <p className="mt-2">WASD or ARROWS - MOVE</p>
        <p>SPACE or J - FIRE</p>
        <p>K - SPECIAL</p>
        <p>ESC or P - PAUSE</p>
      </div>
    </div>
  );
};

const SettingToggle: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, value, onChange }) => (
  <div className="flex items-center gap-8">
    <span className="text-white w-24" style={{ fontSize: 12 }}>
      {label}
    </span>
    <button
      onClick={() => onChange(!value)}
      className={`px-4 py-2 border-2 ${
        value ? 'border-green-400 text-green-400' : 'border-gray-600 text-gray-600'
      }`}
      style={{ fontSize: 10 }}
    >
      {value ? '开' : '关'}
    </button>
  </div>
);
