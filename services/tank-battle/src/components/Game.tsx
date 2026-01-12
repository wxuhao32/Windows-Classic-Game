// Main Game Component

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { GameEngine } from '../game/GameEngine';
import { GameRenderer } from './GameRenderer';
import { VirtualJoystick } from './VirtualJoystick';

interface GameProps {
  initialLevel?: number;
  onQuit: () => void;
}

export const Game: React.FC<GameProps> = ({ initialLevel = 0, onQuit }) => {
  const engine = useMemo(() => new GameEngine(), []);

  const [scene, setScene] = useState(engine.state.scene);
  const [isMobile, setIsMobile] = useState(false);

  // 游戏大厅桥接 API（iframe 父页面可直接调用）
  useEffect(() => {
    (window as any).tankGame = {
      start: () => {
        engine.startGame(engine.state.level ?? initialLevel);
        setScene('game');
      },
      pause: () => {
        engine.pause();
        setScene(engine.state.scene);
      },
      resume: () => {
        engine.resume();
        setScene('game');
      },
      reset: () => {
        engine.reset();
        engine.startGame(initialLevel);
        setScene('game');
      },
      destroy: () => {
        // 由父页面卸载 iframe 即可，这里不做强制清理
      },
    };

    return () => {
      if ((window as any).tankGame) delete (window as any).tankGame;
    };
  }, [engine, initialLevel]);

  // 失焦/切后台自动暂停（不抢父页面焦点）
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        engine.pause();
        setScene(engine.state.scene);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [engine]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // 初次进入直接开始（纯前端静态资源，避免额外等待）
    engine.startGame(initialLevel);
    setScene('game');

    // 轮询同步引擎状态（保持 UI 与引擎解耦）
    const interval = window.setInterval(() => {
      setScene(engine.state.scene);
    }, 100);

    return () => window.clearInterval(interval);
  }, [engine, initialLevel]);

  // Keyboard controls（桌面端）
  useEffect(() => {
    const keyMap: Record<string, string> = {
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      Space: 'fire',
      KeyJ: 'fire',
      KeyK: 'special',
      Escape: 'pause',
      KeyP: 'pause',
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const action = keyMap[e.code];
      if (action === 'pause') {
        if (engine.state.scene === 'game') engine.pause();
        else if (engine.state.scene === 'pause') engine.resume();
        setScene(engine.state.scene);
        return;
      }
      if (action) {
        e.preventDefault();
        engine.setInput(action as any, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const action = keyMap[e.code];
      if (action && action !== 'pause') {
        engine.setInput(action as any, false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [engine]);

  const handleTouchInput = useCallback(
    (key: string, pressed: boolean) => {
      engine.setInput(key as any, pressed);
    },
    [engine],
  );

  const handleResume = () => {
    engine.resume();
    setScene('game');
  };

  const handleRestart = () => {
    engine.restartGame();
    setScene('game');
  };

  const handleNextLevel = () => {
    engine.nextLevel();
    setScene('game');
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      {/* HUD */}
      <div
        className="w-full text-white px-4 py-2 flex justify-between items-center"
        style={{
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Noto Sans", "Liberation Sans", sans-serif',
          fontSize: 12,
          maxWidth: 520,
        }}
      >
        <div>
          <span className="text-green-400">我方</span>
          <span className="ml-2">×{engine.state.lives}</span>
        </div>
        <div>第 {engine.state.level + 1} 关</div>
        <div>得分 {String(engine.state.score).padStart(6, '0')}</div>
      </div>

      {/* Game Canvas */}
      <div className="flex-1 flex items-center justify-center w-full overflow-hidden">
        <GameRenderer engine={engine} />
      </div>

      {/* 敌人剩余 */}
      <div
        className="text-white py-2"
        style={{
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Noto Sans", "Liberation Sans", sans-serif',
          fontSize: 12,
        }}
      >
        敌人剩余：{engine.state.enemiesRemaining}
      </div>

      {/* Touch Controls */}
      {isMobile && scene === 'game' && <div className="fixed left-0 bottom-0 w-[56vw] h-[56vh] z-40">
            <VirtualJoystick
              onChange={(st) => {
                // 未来联机：直接把输入态喂给引擎（引擎内部可按 InputState 驱动）
                engine.setInputState({ move: st.move, magnitude: st.magnitude, fire: false, special: false, seq: 0 });

                // 兼容当前引擎的四方向输入（渐进式重构：先保证可运行）
                const x = st.move.x;
                const y = st.move.y;
                const mag = st.magnitude;

                const clear = () => {
                  engine.setInput('up' as any, false);
                  engine.setInput('down' as any, false);
                  engine.setInput('left' as any, false);
                  engine.setInput('right' as any, false);
                };

                clear();
                if (mag <= 0.0001) return;

                if (Math.abs(x) >= Math.abs(y)) {
                  if (x >= 0) engine.setInput('right' as any, true);
                  else engine.setInput('left' as any, true);
                } else {
                  if (y >= 0) engine.setInput('down' as any, true);
                  else engine.setInput('up' as any, true);
                }
              }}
            />
          </div>

          {/* 移动端操作按钮（不遮挡画面，右手拇指区） */}
          <div className="fixed right-4 bottom-14 z-50 flex flex-col gap-3">
            <ActionBtn
              label="开火"
              onDown={() => engine.setInput('fire' as any, true)}
              onUp={() => engine.setInput('fire' as any, false)}
            />
            <ActionBtn
              label="技能"
              onDown={() => engine.setInput('special' as any, true)}
              onUp={() => engine.setInput('special' as any, false)}
            />
          </div>}

      {/* Pause Overlay */}
      {scene === 'pause' && (
        <div className="fixed inset-0 bg-black/85 flex flex-col items-center justify-center z-50">
          <h2 className="text-white mb-8 text-2xl font-semibold">已暂停</h2>
          <div className="flex flex-col gap-4">
            <MenuButton onClick={handleResume}>继续</MenuButton>
            <MenuButton onClick={handleRestart}>重新开始</MenuButton>
            <MenuButton onClick={onQuit}>退出</MenuButton>
          </div>
        </div>
      )}

      {/* Game Over */}
      {scene === 'gameover' && (
        <div className="fixed inset-0 bg-black/85 flex flex-col items-center justify-center z-50">
          <h2 className="text-red-500 mb-4 text-2xl font-semibold">游戏结束</h2>
          <p className="text-white mb-8">得分：{engine.state.score}</p>
          <div className="flex flex-col gap-4">
            <MenuButton onClick={handleRestart}>再来一局</MenuButton>
            <MenuButton onClick={onQuit}>退出</MenuButton>
          </div>
        </div>
      )}

      {/* Level Complete */}
      {scene === 'levelcomplete' && (
        <div className="fixed inset-0 bg-black/85 flex flex-col items-center justify-center z-50">
          <h2 className="text-green-400 mb-4 text-2xl font-semibold">通关成功</h2>
          <p className="text-white mb-8">得分：{engine.state.score}</p>
          <div className="flex flex-col gap-4">
            {engine.state.level < 2 ? (
              <MenuButton onClick={handleNextLevel}>下一关</MenuButton>
            ) : (
              <MenuButton onClick={handleRestart}>重新开始</MenuButton>
            )}
            <MenuButton onClick={onQuit}>退出</MenuButton>
          </div>
        </div>
      )}
    </div>
  );
};


const ActionBtn: React.FC<{ label: string; onDown: () => void; onUp: () => void }> = ({ label, onDown, onUp }) => (
  <button
    className="w-16 h-16 rounded-xl text-white/90 font-semibold border border-white/20 bg-white/10 active:scale-95 transition-transform select-none touch-none"
    onPointerDown={(e) => { e.preventDefault(); onDown(); }}
    onPointerUp={(e) => { e.preventDefault(); onUp(); }}
    onPointerCancel={(e) => { e.preventDefault(); onUp(); }}
    onContextMenu={(e) => e.preventDefault()}
  >
    {label}
  </button>
);

const MenuButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({
  onClick,
  children,
}) => (
  <button
    onClick={onClick}
    className="px-6 py-3 text-white border border-white/30 rounded-md hover:bg-white/10 active:scale-[0.98] transition"
  >
    {children}
  </button>
);
