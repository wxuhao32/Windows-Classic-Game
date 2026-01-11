/**
 * Home (Menu)
 * - Single-player and private multiplayer (room + optional key)
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Play, Wifi, Info, Copy } from "lucide-react";
import { toast } from "sonner";

function genRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function Home() {
  const [, setLocation] = useLocation();

  const go = (path: string) => {
    sessionStorage.setItem("snake_autoplay_audio", "1");
    setLocation(path);
  };

  const [open, setOpen] = useState(false);
  const [room, setRoom] = useState(() => genRoomId());
  const [key, setKey] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("snake_player_name") || "玩家");

  useEffect(() => {
    localStorage.setItem("snake_player_name", name);
  }, [name]);

  const joinUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("mode", "online");
    params.set("room", room.trim());
    if (key.trim()) params.set("key", key.trim());
    if (name.trim()) params.set("name", name.trim());
    return `${window.location.origin}/game?${params.toString()}`;
  }, [room, key, name]);

  const startOnline = () => {
    const r = room.trim();
    if (!r) return toast.error("请输入房间号");
    const n = name.trim();
    if (!n) return toast.error("请输入昵称");

    const params = new URLSearchParams();
    params.set("mode", "online");
    params.set("room", r);
    if (key.trim()) params.set("key", key.trim());
    params.set("name", n);
    setOpen(false);
    go(`/game?${params.toString()}`);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      toast.success("已复制邀请链接");
    } catch {
      toast.error("复制失败（可能被浏览器拦截）");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0f1419] text-[#e0e0e0] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* 背景网格效果 */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(0deg, transparent 24%, rgba(0, 255, 255, 0.08) 25%, rgba(0, 255, 255, 0.08) 26%, transparent 27%, transparent 74%, rgba(0, 255, 255, 0.08) 75%, rgba(0, 255, 255, 0.08) 76%, transparent 77%, transparent),
              linear-gradient(90deg, transparent 24%, rgba(0, 255, 255, 0.08) 25%, rgba(0, 255, 255, 0.08) 26%, transparent 27%, transparent 74%, rgba(0, 255, 255, 0.08) 75%, rgba(0, 255, 255, 0.08) 76%, transparent 77%, transparent)
            `,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="max-w-lg w-full relative z-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#00ffff] drop-shadow-lg">
            贪吃蛇大作战
          </h1>
          <p className="text-[#8a8a8a] mt-2 text-sm sm:text-base">单机 / 私密联机（最多 4 人，同场 4 条蛇）</p>
        </div>

        <div className="space-y-4">
          <Button
            onClick={() => go("/game?mode=offline")}
            className="w-full bg-[#ff00ff] text-white hover:bg-[#ff00ff]/80 font-bold uppercase tracking-wider text-base sm:text-lg py-5 sm:py-6"
            size="lg"
          >
            <Play className="w-5 h-5 mr-2" />
            单机对战
          </Button>

          <Button
            onClick={() => setOpen(true)}
            className="w-full bg-[#00ffff] text-[#0f1419] hover:bg-[#00ffff]/80 font-bold uppercase tracking-wider text-base sm:text-lg py-5 sm:py-6"
            size="lg"
          >
            <Wifi className="w-5 h-5 mr-2" />
            私密联机（房间+密码）
          </Button>

          <Button
            variant="outline"
            onClick={() => toast("提示：联机最多 4 人。房间密码可留空（公开房间），填了就是私密房间。")}
            className="w-full border-[#2a2a2a] text-[#e0e0e0] hover:bg-[#1a1f24] py-4"
          >
            <Info className="w-4 h-4 mr-2" />
            玩法说明
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[#0f1419] border-[#2a2a2a] text-[#e0e0e0]">
          <DialogHeader>
            <DialogTitle className="text-[#00ffff]">加入 / 创建房间</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>房间号</Label>
              <div className="flex gap-2">
                <Input value={room} onChange={(e) => setRoom(e.target.value.toUpperCase())} className="bg-[#0b0f13] border-[#2a2a2a]" />
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#2a2a2a] text-[#e0e0e0]"
                  onClick={() => setRoom(genRoomId())}
                >
                  随机
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>密码（可选）</Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="留空=公开房间；填写=私密房间"
                className="bg-[#0b0f13] border-[#2a2a2a]"
              />
            </div>

            <div className="space-y-2">
              <Label>昵称</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-[#0b0f13] border-[#2a2a2a]" />
            </div>

            <div className="space-y-2">
              <Label>邀请链接</Label>
              <div className="flex gap-2">
                <Input value={joinUrl} readOnly className="bg-[#0b0f13] border-[#2a2a2a]" />
                <Button type="button" onClick={copyLink} className="bg-[#00ffff] text-[#0f1419] hover:bg-[#00ffff]/80">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-xs text-white/50">把链接发给好友即可一起进入同一房间。</div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-[#2a2a2a] text-[#e0e0e0]"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button onClick={startOnline} className="bg-[#00ffff] text-[#0f1419] hover:bg-[#00ffff]/80 font-bold">
              进入房间（最多 4 人）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
