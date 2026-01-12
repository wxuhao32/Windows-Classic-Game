# 坦克大战联机版（PVP + COOP）补丁包

本补丁包用于覆盖到你的仓库根目录（Windows-Classic-Game-main/），为 services/tank-battle 增加：
- Web Server（Express）+ WebSocket（房间制 + 密码验证）
- 联机模式：对战（PVP）+ 合作（CO-OP）
- 主菜单新增「联机对战」入口
- GameEngine 增加 2P（remotePlayer）与快照同步接口（toNetworkSnapshot / applyNetworkSnapshot）

## 1) 覆盖方法
把 zip 解压后，直接覆盖到仓库根目录即可（保持路径不变）。

## 2) Render 部署（Web Service）
- Root Directory: services/tank-battle
- Build Command: npm ci && npm run build
- Start Command: npm start

WebSocket 地址：/ws（同域）
静态资源：dist/public

## 3) 游戏内联机使用
- 进入「联机对战」
- 选择模式：
  - 对战（PVP）：两人互打
  - 合作（CO-OP）：两人打 AI
- 输入：房间号 + 密码 + 昵称
- 「创建房间」为房主；「加入房间」为玩家

## 4) 大厅集成
你大厅目前的 games/tank-battle 是 wrapper 方案：
- 你只要把这个 Web Service 部署出来的 URL 填进 wrapper 即可。
- 或者把 lobby/app.js 里 tankBattle 的 src 改为：../games/tank-battle/index.html?url=你的联机站点

## 5) 说明（当前同步策略）
- 房主推进引擎（tick）并以 ~15fps 发送快照
- 客人不驱动引擎，仅渲染快照（避免漂移）
- 客人把输入（方向/开火/技能）发送给房主

你后续要做“权威服务器 + 预测回滚”，这套结构也能无痛升级。
