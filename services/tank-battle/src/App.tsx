import { useState } from 'react';
import { MainMenu } from './components/MainMenu';
import { Game } from './components/Game';
import { Settings } from './components/Settings';
import type { OnlineRoomResult } from './components/OnlineRoomModal';
import type { RoomMode } from './shared/protocol';
import './App.css';

type Screen = 'menu' | 'game' | 'settings';
type GameMode = 'single' | 'online';

export interface OnlineConfig {
  action: 'create' | 'join';
  roomId: string;
  password: string;
  nickname: string;
  mode: RoomMode;
}

function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [mode, setMode] = useState<GameMode>('single');
  const [online, setOnline] = useState<OnlineConfig | null>(null);

  const startOnline = (r: OnlineRoomResult) => {
    setMode('online');
    setOnline({ action: r.action, roomId: r.roomId, password: r.password, nickname: r.nickname, mode: r.mode });
    setScreen('game');
  };

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      {screen === 'menu' && (
        <MainMenu
          onStartGame={() => { setMode('single'); setOnline(null); setScreen('game'); }}
          onStartOnline={startOnline}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'game' && (
        <Game
          mode={mode}
          online={online}
          onQuit={() => { setScreen('menu'); }}
        />
      )}
      {screen === 'settings' && (
        <Settings onBack={() => setScreen('menu')} />
      )}
    </div>
  );
}

export default App;
