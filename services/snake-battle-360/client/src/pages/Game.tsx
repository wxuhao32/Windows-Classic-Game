import React, { useEffect, useRef, useState } from 'react';
import GameCanvas from '../components/GameCanvas';
import { useGameStore } from '../store/gameStore';

export default function Game() {
  const { initGame, gameRunning, startGame, stopGame } = useGameStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initGame();
    setLoading(false);
  }, [initGame]);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="game-page">
      <GameCanvas />
      {!gameRunning && (
        <button onClick={startGame} className="start-button">
          Start Game
        </button>
      )}
      {gameRunning && (
        <button onClick={stopGame} className="stop-button">
          Stop Game
        </button>
      )}
    </div>
  );
}
