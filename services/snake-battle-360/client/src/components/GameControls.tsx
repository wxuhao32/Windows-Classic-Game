/**
 * 游戏控制面板组件
 * 设计哲学：现代竞技游戏风格，提供清晰的游戏控制选项
 */

import { Button } from '@/components/ui/button';
import { useRef, type SyntheticEvent } from 'react';
import { Pause, Play, RotateCcw, Home } from 'lucide-react';
import { GameState } from '@/lib/gameEngine';

interface GameControlsProps {
  gameState: GameState;
  onPauseToggle: () => void;
  onRestart: () => void;
  onHome: () => void;
  hidePause?: boolean;
}

export function GameControls({
  gameState,
  onPauseToggle,
  onRestart,
  onHome,
  hidePause,
}: GameControlsProps) {
  // 手机上的 click 有时会有延迟或被覆盖；这里用 pointerdown 立即响应，并做防抖避免重复触发。
  const lastFireAt = useRef(0);
  const wrap = (fn: () => void) => (e: SyntheticEvent) => {
    const now = Date.now();
    if (now - lastFireAt.current < 250) return;
    lastFireAt.current = now;
    e.preventDefault();
    fn();
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 justify-center w-full">
      {!hidePause && (
        <Button
          onPointerDown={wrap(onPauseToggle)}
          onClick={wrap(onPauseToggle)}
          disabled={!gameState.isRunning}
          className="bg-[#00ffff] text-[#0f1419] hover:bg-[#00ffff]/80 font-bold uppercase tracking-wider w-full md:w-auto"
          size="lg"
          style={{ touchAction: 'manipulation' }}
          >
          {gameState.isPaused ? (
            <>
              <Play className="w-4 h-4 mr-2" />
              继续
            </>
          ) : (
            <>
              <Pause className="w-4 h-4 mr-2" />
              暂停
            </>
          )}
        </Button>
      )}

      <Button
        onPointerDown={wrap(onRestart)}
        onClick={wrap(onRestart)}
        className="bg-[#ff6600] text-[#0f1419] hover:bg-[#ff6600]/80 font-bold uppercase tracking-wider w-full md:w-auto"
        size="lg"
        style={{ touchAction: 'manipulation' }}
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        重新开始
      </Button>

      <Button
        onPointerDown={wrap(onHome)}
        onClick={wrap(onHome)}
        variant="outline"
        className="border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88]/10 font-bold uppercase tracking-wider w-full md:w-auto"
        size="lg"
        style={{ touchAction: 'manipulation' }}
      >
        <Home className="w-4 h-4 mr-2" />
        返回主菜单
      </Button>

      {!gameState.isRunning && (
        <div className="md:ml-4 flex items-center px-4 py-2 bg-[#ff3333]/20 border-2 border-[#ff3333] rounded-lg">
          <span className="text-[#ff3333] font-bold uppercase tracking-wider">游戏结束</span>
        </div>
      )}
    </div>
  );
}
