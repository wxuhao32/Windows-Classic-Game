/**
 * 游戏信息面板组件
 * 设计哲学：现代竞技游戏风格，显示玩家排名和对手信息
 */

import { GameState, getRankings } from '@/lib/gameEngine';

interface GameInfoProps {
  gameState: GameState;
  mySnakeId?: string | null;
}

export function GameInfo({ gameState, mySnakeId }: GameInfoProps) {
  const rankings = getRankings(gameState);
  const fallbackMyId = rankings.find((r) => r.isPlayer)?.id || null;
  const me = mySnakeId || fallbackMyId;

  const playerRanking = rankings.find((r) => r.id === me);
  const playerRank = me ? rankings.findIndex((r) => r.id === me) + 1 : 0;

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full">
      {/* 玩家信息卡 */}
      <div className="flex-1 bg-[#1a1f2e] border-2 border-[#00ff88] rounded-lg p-4 shadow-lg"
        style={{
          boxShadow: '0 0 15px rgba(0, 255, 136, 0.2), inset 0 0 10px rgba(0, 255, 136, 0.05)',
        }}>
        <div className="text-xs uppercase tracking-widest text-[#a0a0a0] mb-2">
          {me ? '我的蛇' : '未接管'}
        </div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[#a0a0a0]">排名</span>
            <span className="text-xl font-bold text-[#00ff88]">
              {me ? `${playerRank}/${rankings.length}` : `-/${rankings.length}`}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#a0a0a0]">长度</span>
            <span className="text-lg font-bold text-[#00ffff]">{playerRanking?.length || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#a0a0a0]">得分</span>
            <span className="text-lg font-bold text-[#ffff00]">{playerRanking?.score || 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#a0a0a0]">状态</span>
            <span className={`text-sm font-bold ${playerRanking?.isAlive ? 'text-[#00ff88]' : 'text-[#ff3333]'}`}>
              {playerRanking?.isAlive ? '存活' : '已死亡'}
            </span>
          </div>
        </div>
      </div>

      {/* 对手信息列表 */}
      <div className="flex-1 bg-[#1a1f2e] border-2 border-[#ff00ff] rounded-lg p-4 shadow-lg"
        style={{
          boxShadow: '0 0 15px rgba(255, 0, 255, 0.2), inset 0 0 10px rgba(255, 0, 255, 0.05)',
        }}>
        <div className="text-xs uppercase tracking-widest text-[#a0a0a0] mb-3">其他排行</div>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {rankings.filter((r) => r.id !== me).map((ranking) => (
            <div
              key={ranking.id}
              className="flex items-center justify-between text-sm p-2 rounded border border-[#404854]"
              style={{
                backgroundColor: ranking.isAlive ? 'rgba(0, 255, 136, 0.05)' : 'rgba(255, 51, 51, 0.05)',
              }}>
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: ranking.color }}
                />
                <span className="text-[#e0e0e0]">{ranking.name}</span>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-[#00ffff]">{ranking.length}</span>
                <span className={ranking.isAlive ? 'text-[#00ff88]' : 'text-[#ff3333]'}>
                  {ranking.isAlive ? '活' : '死'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 游戏时间 */}
      <div className="flex-1 bg-[#1a1f2e] border-2 border-[#00ffff] rounded-lg p-4 shadow-lg"
        style={{
          boxShadow: '0 0 15px rgba(0, 255, 255, 0.2), inset 0 0 10px rgba(0, 255, 255, 0.05)',
        }}>
        <div className="text-xs uppercase tracking-widest text-[#a0a0a0] mb-2">游戏信息</div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[#a0a0a0]">运行时间</span>
            <span className="text-lg font-bold text-[#00ffff]">
              {formatTime(Math.floor(gameState.gameTime / 1000))}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#a0a0a0]">食物数量</span>
            <span className="text-lg font-bold text-[#ffff00]">{gameState.food.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[#a0a0a0]">存活蛇数</span>
            <span className="text-lg font-bold text-[#ff6600]">
              {gameState.snakes.filter((s) => s.isAlive).length}/{gameState.snakes.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 格式化时间显示
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
