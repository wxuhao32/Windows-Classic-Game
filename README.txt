# Windows 复古游戏大厅（静态）

本项目是一个静态的“Windows 风格游戏大厅”，入口：根目录 `index.html`（自动跳转到 `lobby/index.html`）。

## 已集成：坦克大战（2000）
- 大厅图标：桌面「坦克大战（2000）」
- 游戏目录：`games/tank-battle/`
- 游戏入口：`games/tank-battle/index.html`
- 说明：该版本来自 `2000tank-main` 的单机页面（`single.html`），可直接静态运行（无需 Node 服务）。
- 可选 BGM：把背景音乐放到 `games/tank-battle/audio/音乐.mp3`

> 你之前的旧坦克方案（`games/tank-battle` 旧实现 + `services/tank-battle`）已移除。

## 其它说明
- 联机贪吃蛇依旧是独立服务：见 `DEPLOY.md`
