# 部署与集成说明（游戏大厅 + 贪吃蛇大作战 360 联机）

这个 ZIP 包里包含两部分：

1. **游戏大厅（静态站点）**：仓库根目录 + `lobby/` + `games/*`
2. **贪吃蛇大作战 360 联机服务（需要 Node 常驻）**：`services/snake-battle-360`

## 你现在的情况：大厅已是静态部署
静态站点无法运行 WebSocket 服务端，所以联机蛇必须 **单独部署一个 Node 服务**。
大厅只需要加入口（本包已加好）。

---

## A. 本地联调（推荐先跑通）

### 1) 启动贪吃蛇联机服务（Node + WS）
```bash
cd services/snake-battle-360
npm install
npm run dev:server   # ws://localhost:3001/ws
```

再开一个终端启动前端：
```bash
cd services/snake-battle-360
npm run dev          # http://localhost:3000
```

### 2) 启动大厅（静态）
你可以用 VSCode Live Server 或任意静态服务器打开根目录的 `index.html`。
大厅里点击 **“蛇大作战”** 会打开内置 launcher：
- 默认加载 `http://localhost:3000`
- 你也可以在输入框里改成别的地址并保存

---

## B. 正式部署（推荐：Render）

### 1) 把联机蛇服务部署到 Render
在 Render 创建 **Web Service**，连接到你的 GitHub 仓库，设置：

- **Root Directory**：`services/snake-battle-360`
- **Build Command**：
  ```bash
  npm install && npm run build
  ```
- **Start Command**：
  ```bash
  npm start
  ```

Render 会自动注入 `PORT` 环境变量，本服务会监听它。
部署成功后你会得到一个 URL，例如：
- `https://snake-battle-360.onrender.com`
- WebSocket 自动是：`wss://snake-battle-360.onrender.com/ws`

### 2) 在大厅里配置联机蛇地址
打开你已部署的大厅 → 点击 **蛇大作战** → 顶部输入框粘贴 Render URL：
- `https://snake-battle-360.onrender.com`
点击 **保存并加载**。

该设置会写入浏览器 localStorage（同一台设备以后不用再填）。

---

## C. 只想“一个域名”看起来像集成（可选）
你可以把大厅继续放在 GitHub Pages/OSS/CDN；
联机蛇放在 Render；
大厅里通过 iframe 打开联机蛇（本包就是这样做的）。

如果你强烈想同域名同端口，需要把大厅也迁移到 Node 服务或做反向代理（后续我也可以帮你做）。

---

## D. 放自备素材（背景/BGM）
部署后的联机蛇服务使用 `services/snake-battle-360/client/public`：

- 背景图：`services/snake-battle-360/client/public/background/1.png`
- BGM：`services/snake-battle-360/client/public/audio/bgm2.mp3`

背景图建议：**4:3，1600×1200 或 1920×1440，≤1MB**。
