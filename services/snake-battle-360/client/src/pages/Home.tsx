/**
 * 游戏主菜单页面
 * - 单机：本地逻辑
 * - 联机：房间号 + 密码（可选）验证的私密对战
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Play, Wifi, Copy, RefreshCw, Info } from "lucide-react";

const LS_ROOM = "snake_battle_room";
const LS_KEY = "snake_battle_key";
const LS_NAME = "snake_battle_name";

function randomRoomId() {
  // 6 位大写字母数字
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [onlineOpen, setOnlineOpen] = useState(false);

  const [roomId, setRoomId] = useState("");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    setRoomId(localStorage.getItem(LS_ROOM) || randomRoomId());
    setKey(localStorage.getItem(LS_KEY) || "");
    setName(localStorage.getItem(LS_NAME) || "");
  }, []);

  const inviteLink = useMemo(() => {
    const url = new URL(window.location.href);
    url.pathname = "/game";
    url.searchParams.set("mode", "online");
    url.searchParams.set("room", roomId || "");
    if (key) url.searchParams.set("key", key);
    // ✅ 邀请链接不携带 name，好友自己填
    url.searchParams.delete("name");
    return url.toString();
  }, [roomId, key]);

  const go = (path: string) => {
    // 下一页尝试自动播放 BGM（多数浏览器要求“用户手势”触发；从这里点击进入基本满足条件）
    sessionStorage.setItem("snake_autoplay_audio", "1");
    setLocation(path);
  };

  const startOnline = () => {
    const r = roomId.trim().toUpperCase();
    const k = key.trim();
    const n = name.trim();

    if (!r) {
      toast.error("请输入房间号");
      return;
    }

    localStorage.setItem(LS_ROOM, r);
    localStorage.setItem(LS_KEY, k);
    localStorage.setItem(LS_NAME, n);

    const params = new URLSearchParams();
    params.set("mode", "online");
    params.set("room", r);
    if (k) params.set("key", k);
    if (n) params.set("name", n);

    setOnlineOpen(false);
    go(`/game?${params.toString()}`);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("邀请链接已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
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
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="relative z-10 text-center max-w-2xl">
        <div className="mb-8 sm:mb-12">
          <h1
            className="text-5xl sm:text-7xl font-black text-[#00ff88] mb-3 sm:mb-4 tracking-widest"
            style={{ textShadow: "0 0 30px rgba(0, 255, 136, 0.6), 0 0 60px rgba(0, 255, 136, 0.3)" }}
          >
            SNAKE
          </h1>
          <h2
            className="text-4xl sm:text-6xl font-black text-[#ff00ff] tracking-widest"
            style={{ textShadow: "0 0 30px rgba(255, 0, 255, 0.6), 0 0 60px rgba(255, 0, 255, 0.3)" }}
          >
            BATTLE
          </h2>
          <p className="text-[#00ffff] text-base sm:text-lg mt-4 sm:mt-6 uppercase tracking-widest font-bold">
            360° 多人竞技贪吃蛇
          </p>
        </div>

        <div
          className="bg-[#1a1f2e] border-2 border-[#00ff88] rounded-lg p-5 sm:p-8 mb-8 sm:mb-12"
          style={{ boxShadow: "0 0 20px rgba(0, 255, 136, 0.2), inset 0 0 20px rgba(0, 255, 136, 0.05)" }}
        >
          <p className="text-[#a0a0a0] leading-relaxed mb-4">
            吃掉食物增长，蛇头撞墙或撞到其他蛇身体会死亡。联机模式支持「房间号 + 密码（可选）」私密对战，适合和好友开黑。
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-[#0f1419] rounded border border-[#00ffff]">
              <div className="text-[#00ffff] font-bold mb-1">🎮</div>
              <div className="text-[#a0a0a0]">摇杆/键盘</div>
            </div>
            <div className="p-3 bg-[#0f1419] rounded border border-[#ff00ff]">
              <div className="text-[#ff00ff] font-bold mb-1">🔐</div>
              <div className="text-[#a0a0a0]">房间验证</div>
            </div>
            <div className="p-3 bg-[#0f1419] rounded border border-[#ffff00]">
              <div className="text-[#ffff00] font-bold mb-1">🖥️</div>
              <div className="text-[#a0a0a0]">全屏体验</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-8 sm:mb-12">
          <Button
            onClick={() => go("/game")}
            className="bg-[#00ff88] text-[#0f1419] hover:bg-[#00ff88]/80 font-bold uppercase tracking-wider text-base sm:text-lg py-5 sm:py-6"
            size="lg"
          >
            <Play className="w-5 h-5 mr-2" />
            单机对战
          </Button>

          <Button
            onClick={() => setOnlineOpen(true)}
            className="bg-[#00ffff] text-[#0f1419] hover:bg-[#00ffff]/80 font-bold uppercase tracking-wider text-base sm:text-lg py-5 sm:py-6"
            size="lg"
          >
            <Wifi className="w-5 h-5 mr-2" />
            联机对战（房间）
          </Button>

          <Button
            variant="outline"
            className="border-2 border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff]/10 font-bold uppercase tracking-wider text-base sm:text-lg py-5 sm:py-6"
            size="lg"
            onClick={() => toast("提示：联机房间号区分大小写已统一为大写，密码可留空。")}
          >
            <Info className="w-5 h-5 mr-2" />
            游戏说明
          </Button>
        </div>

        <div className="bg-[#1a1f2e] border border-[#404854] rounded-lg p-5 sm:p-6 text-left">
          <p className="text-[#00ffff] font-bold mb-3 uppercase tracking-wider">⌨️ 快捷键</p>
          <div className="grid grid-cols-2 gap-3 text-sm text-[#a0a0a0]">
            <div>
              <span className="text-[#ffff00]">↑ ↓ ← →</span> 或 <span className="text-[#ffff00]">WASD</span>
              <p className="text-xs mt-1">控制蛇方向</p>
            </div>
            <div>
              <span className="text-[#ffff00]">空格</span>
              <p className="text-xs mt-1">暂停/继续（联机为投票）</p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#00ff88]/5 to-transparent pointer-events-none" />

      {/* 联机房间弹窗 */}
      <Dialog open={onlineOpen} onOpenChange={setOnlineOpen}>
        <DialogContent className="max-w-md bg-[#1a1f2e] border-2 border-[#00ffff] text-white">
          <DialogHeader>
            <DialogTitle className="text-[#00ffff] font-black tracking-widest">联机房间</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm text-white/80">房间号</div>
              <div className="flex gap-2">
                <Input
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="例如 ABC123"
                  className="bg-black/30 border-white/15 text-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                  onClick={() => setRoomId(randomRoomId())}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-sm text-white/80">房间密码（可选）</div>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="留空表示无密码"
                className="bg-black/30 border-white/15 text-white"
              />
            </div>

            <div className="space-y-1">
              <div className="text-sm text-white/80">你的昵称（可选）</div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="不填则自动生成"
                className="bg-black/30 border-white/15 text-white"
              />
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/75">
              <div className="mb-2">邀请链接（发给好友即可加入同一房间）：</div>
              <div className="break-all font-mono text-white/85">{inviteLink}</div>
              <Button
                type="button"
                variant="outline"
                className="mt-3 border-white/20 text-white hover:bg-white/10 w-full"
                onClick={copyInvite}
              >
                <Copy className="w-4 h-4 mr-2" />
                复制邀请链接
              </Button>
            </div>

            <Button
              onClick={startOnline}
              className="w-full bg-[#00ffff] text-[#0f1419] hover:bg-[#00ffff]/80 font-black tracking-widest"
              size="lg"
            >
              <Wifi className="w-5 h-5 mr-2" />
              开始联机
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
