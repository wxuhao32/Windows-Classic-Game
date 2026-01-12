import { useState } from 'react';
import { MainMenu } from './components/MainMenu';
import { Game } from './components/Game';
import { Settings } from './components/Settings';
import './App.css';

type Screen = 'menu' | 'game' | 'settings';

function App() {
  const [screen, setScreen] = useState<Screen>('menu');

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      {screen === 'menu' && (
        <MainMenu
          onStartGame={() => setScreen('game')}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'game' && (
        <Game onQuit={() => setScreen('menu')} />
      )}
      {screen === 'settings' && (
        <Settings onBack={() => setScreen('menu')} />
      )}
    </div>
  );
}

export default App;
