把本压缩包解压后，将以下目录按原路径覆盖到你的游戏大厅项目根目录：

- games/feiji2/ (新版本，纯静态可运行，不依赖 npm / node / 外网 CDN)
- lobby/assets/icon-feiji.svg (飞机图标)

如果你的大厅代码里还没有挂载“feiji2”入口：
- lobby/index.html 需要有 data-game="feiji2" 的图标按钮
- lobby/app.js 的 GAME_META 需要包含 feiji2: { src: "../games/feiji2/index.html", icon: "./assets/icon-feiji.svg" }

（你之前仓库里已经有这些配置的话，只覆盖上述两个目录即可。）
