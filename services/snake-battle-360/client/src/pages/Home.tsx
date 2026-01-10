/**
 * 游戏主菜单页面
 * 设计哲学：现代竞技游戏风格，提供游戏开始和说明
 */

import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Play, Wifi, Info } from 'lucide-react';

export default function Home() {
  const [, setLocation] = useLocation();

  const go = (path: string) => {
    // 让下一页尝试自动播放 BGM（多数浏览器要求“用户手势”触发；从这里点击进入基本满足条件）
    sessionStorage.setItem('snake_autoplay_audio', '1');
    setLocation(path);
  };

  return (
    <div className="min-h-[100dvh] bg-[#0f1419] text-[#e0e0e0] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* 背景网格效果 */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(0deg, transparent 24%, rgba(0, 255, 136, 0.1) 25%, rgba(0, 255, 136, 0.1) 26%, transparent 27%, transparent 74%, rgba(0, 255, 136, 0.1) 75%, rgba(0, 255, 136, 0.1) 76%, transparent 77%, transparent),
              linear-gradient(90deg, transparent 24%, rgba(0, 255, 136, 0.1) 25%, rgba(0, 255, 136, 0.1) 26%, transparent 27%, transparent 74%, rgba(0, 255, 136, 0.1) 75%, rgba(0, 255, 136, 0.1) 76%, transparent 77%, transparent)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* 内容容器 */}
      <div className="relative z-10 text-center max-w-2xl">
        {/* 标题 */}
        <div className="mb-8 sm:mb-12">
          <h1
            className="text-5xl sm:text-7xl font-black text-[#00ff88] mb-3 sm:mb-4 tracking-widest"
            style={{
              textShadow: '0 0 30px rgba(0, 255, 136, 0.6), 0 0 60px rgba(0, 255, 136, 0.3)',
            }}>
            SNAKE
          </h1>
          <h2
            className="text-4xl sm:text-6xl font-black text-[#ff00ff] tracking-widest"
            style={{
              textShadow: '0 0 30px rgba(255, 0, 255, 0.6), 0 0 60px rgba(255, 0, 255, 0.3)',
            }}>
            BATTLE
          </h2>
          <p className="text-[#00ffff] text-base sm:text-lg mt-4 sm:mt-6 uppercase tracking-widest font-bold">
            多人竞技版贪吃蛇游戏
          </p>
        </div>

        {/* 游戏描述 */}
        <div className="bg-[#1a1f2e] border-2 border-[#00ff88] rounded-lg p-5 sm:p-8 mb-8 sm:mb-12"
          style={{
            boxShadow: '0 0 20px rgba(0, 255, 136, 0.2), inset 0 0 20px rgba(0, 255, 136, 0.05)',
          }}>
          <p className="text-[#a0a0a0] leading-relaxed mb-4">
            在这个刺激的竞技场中，与 AI 对手展开激烈的蛇类战斗。吃掉食物增加长度，避免碰撞，成为最后的幸存者！
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-[#0f1419] rounded border border-[#00ffff]">
              <div className="text-[#00ffff] font-bold mb-1">🎮</div>
              <div className="text-[#a0a0a0]">实时对战</div>
            </div>
            <div className="p-3 bg-[#0f1419] rounded border border-[#ff00ff]">
              <div className="text-[#ff00ff] font-bold mb-1">🤖</div>
              <div className="text-[#a0a0a0]">智能 AI</div>
            </div>
            <div className="p-3 bg-[#0f1419] rounded border border-[#ffff00]">
              <div className="text-[#ffff00] font-bold mb-1">🏆</div>
              <div className="text-[#a0a0a0]">排名系统</div>
            </div>
          </div>
        </div>

        {/* 按钮组 */}
        <div className="flex flex-col gap-4 mb-8 sm:mb-12">
          <Button
            onClick={() => go('/game')}
            className="bg-[#00ff88] text-[#0f1419] hover:bg-[#00ff88]/80 font-bold uppercase tracking-wider text-base sm:text-lg py-5 sm:py-6"
            size="lg">
            <Play className="w-5 h-5 mr-2" />
            单机对战
          </Button>

          <Button
            onClick={() => go('/game?mode=online')}
            className="bg-[#00ffff] text-[#0f1419] hover:bg-[#00ffff]/80 font-bold uppercase tracking-wider text-base sm:text-lg py-5 sm:py-6"
            size="lg">
            <Wifi className="w-5 h-5 mr-2" />
            联机对战
          </Button>

          <Button
            variant="outline"
            className="border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff]/10 font-bold uppercase tracking-wider text-base sm:text-lg py-5 sm:py-6"
            size="lg">
            <Info className="w-5 h-5 mr-2" />
            游戏说明
          </Button>
        </div>

        {/* 快捷键提示 */}
        <div className="bg-[#1a1f2e] border border-[#404854] rounded-lg p-5 sm:p-6 text-left">
          <p className="text-[#00ffff] font-bold mb-3 uppercase tracking-wider">⌨️ 快捷键</p>
          <div className="grid grid-cols-2 gap-3 text-sm text-[#a0a0a0]">
            <div>
              <span className="text-[#ffff00]">↑ ↓ ← →</span> 或 <span className="text-[#ffff00]">WASD</span>
              <p className="text-xs mt-1">控制蛇移动</p>
            </div>
            <div>
              <span className="text-[#ffff00]">空格</span>
              <p className="text-xs mt-1">暂停/继续</p>
            </div>
          </div>
        </div>
      </div>

      {/* 底部装饰 */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#00ff88]/5 to-transparent pointer-events-none" />
    </div>
  );
}
