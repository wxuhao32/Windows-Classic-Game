# Retro 2048（纯原生 HTML/CSS/JS + Express）

一个复古风（可偏 Windows 视觉 + 现代扁平混合）的 **2048** 网页游戏：桌面端、手机端都好玩，支持 **触屏滑动** 与 **键盘操作**，并包含 **计分、撤销一步、胜利/失败弹窗、主题切换（亮/暗）与 WebAudio 音效**。

---

## 玩法说明

- 棋盘为 **4×4**。
- 每次向 **上/下/左/右** 滑动（或按方向键/WASD）：
  - 所有方块会向该方向滑动并尽量靠拢；
  - 相邻且数值相同的方块会 **合并**（一次移动中每个方块 **最多只合并一次**）；
  - 合并后生成的新数值会累加到 **SCORE**。
- 每次有效移动后，会随机生成一个新方块（2 或 4）。
- 当合成 **2048** 时触发 **胜利弹窗**（可选择继续挑战）。
- 当棋盘无法再移动时触发 **失败弹窗**。
- 支持 **撤销一步（Undo）**：回到上一步移动前的状态（仅 1 步）。

---

## 本地运行

> 需要 Node.js **18.x**

```bash
npm install
npm start
```

然后访问：

- http://localhost:3000

---

## Render 部署步骤（Web Service）

1. 将本项目推到你的 GitHub / GitLab 仓库（或直接上传到 Render）。
2. 登录 Render，创建 **New + → Web Service**，选择你的仓库。
3. 设置：
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. 直接部署即可。

说明：

- 服务端使用 `process.env.PORT`（Render 会自动注入），本地默认 `3000`。
- Node 版本通过 `package.json -> engines.node = 18.x` 固定为 18.x。

---

## 工程结构

```
/public
  index.html
  styles.css
  game.js
/server
  index.js
README.md
package.json
```

---

## 操作提示

- **键盘**：方向键 / WASD
- **触屏**：在棋盘上滑动（手机竖屏优先）
- **主题切换**：亮 / 暗（使用 localStorage 记忆）
- **音效开关**：滑动、合并、胜利（WebAudio 生成，免侵权）
