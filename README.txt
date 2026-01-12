# Patch说明（替换文件即可）

本压缩包只包含“游戏大厅桌面”接入【坦克大战】所需新增/替换的文件。

## 需要覆盖/新增的文件清单

### 游戏大厅
- lobby/index.html（新增桌面图标：坦克大战）
- lobby/app.js（GAME_META 增加 tankBattle 条目）
- lobby/assets/icon-tank.svg（新增图标）

### 新增一个 wrapper（用于在大厅窗口里加载你部署后的坦克大战地址）
- games/tank-battle/index.html

## 使用说明（非常重要）
1. 先把坦克大战部署成静态站点，得到一个 URL（例如 Render: https://xxxx.onrender.com）
2. 打开大厅 -> 双击“坦克大战”图标
3. 第一次会看到顶部栏：把 URL 粘贴进去，点“保存并加载”
   - wrapper 会把地址保存到 localStorage（key: tank_battle_url），之后无需再填
4. 你也可以在 games/tank-battle/index.html 里把 DEFAULT_URL 改成你的固定地址。

## 可选（更丝滑）
如果你想从大厅直接“无栏打开”，把 lobby/app.js 里的 src 改为：
../games/tank-battle/index.html?url=你的地址
