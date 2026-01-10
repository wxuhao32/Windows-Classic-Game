# Patch说明（替换文件即可）

本压缩包只包含需要替换/覆盖的文件（不会把 node_modules 打进去）。

## 你要替换的文件清单

### 游戏大厅（Windows-Classic-Game-main）
- lobby/app.js
- lobby/index.html

变更点：
- “贪吃蛇”图标默认直接打开 https://tanchishe-ezxi.onrender.com/game?mode=online （不再需要手动输入域名）
- iframe 增加 allowfullscreen，方便游戏内全屏按钮生效

### 贪吃蛇联机项目（snake-battle-game）
- server/index.ts（修复生产环境静态资源路径，Render 上能直接打开前端）
- server/multiplayer.ts（增加房间 room + 密码 key，支持玩家1/玩家2命名）
- shared/gameEngine.ts（大幅提升转向跟手性：死区更小、最大角速度更高、转向曲线更灵敏）
- client/src/pages/Home.tsx（联机入口增加“房间号/密码/名字”，并支持复制邀请链接）
- client/src/pages/Game.tsx（WS 连接自动携带 room/key/name；增加全屏能力接入）
- client/src/components/GameControls.tsx（新增“全屏/退出全屏”按钮，移动端支持 pointerdown）
- client/src/index.css（移动端体验：防止页面滚动抖动）

- package.json（加入 cross-env，Windows CMD 也能跑 dev:server/start）

## 房间联机怎么玩
1. 你创建房间：进入联机 -> 填写房间号（如 1234）+ 可选密码 key -> 点击“复制邀请链接”
2. 把邀请链接发给朋友；朋友打开链接后，直接点“开始联机”（会自动预填 room/key/name）
3. 也可以手动约定：双方填同一个 room 和 key 即可进入同房间。

## Render 部署后仍打不开？（最常见原因）
- 你没有重新 build+deploy（本补丁修复了 server/index.ts 静态目录；需要重新部署才生效）
- Render 里 Start Command 应该是：npm run start （或 node dist/index.js）
- Build Command：npm run build
