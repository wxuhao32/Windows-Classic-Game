# Snake Arcade（像素复古贪吃蛇）

- 技术栈：Node.js 18.x + Express + 原生 HTML/CSS/JS
- 手机/电脑一致体验：键盘（方向键/WASD）+ 屏幕方向键（↑↓←→）+ 支持滑动
- 功能：计分、逐渐加速、失败判定、重新开始、深浅主题切换、音效开关（吃/死亡）、背景音乐开关（自备 mp3）、手机一键全屏

---

## 本地运行

```bash
npm install
npm start
```

启动后访问：`http://localhost:3000`


## 直接双击 HTML 离线运行（无需 localhost）

如果你不想启动 Node 服务，也可以直接在文件管理器中 **双击打开**：

- `public/index.html`

> 说明：为了兼容 `file://` 方式，本项目已内置 `public/js/bundle.js`（把模块代码预打包成单文件脚本）。
> 你仍然可以在 `public/js/modules/` 里按模块方式开发维护源码。


---

## 背景音乐（自备 MP3）

1. 把你的 mp3 文件放到：`public/audio/bgm.mp3`
2. 进入游戏后，点击顶部的“音乐”按钮即可播放/停止。

> 说明：浏览器会限制自动播放。首次点击方向键/滑动/任意按钮后，音乐才会真正开始播放（正常现象）。

## 全屏（手机端）

点击顶部“全屏”按钮即可进入/退出全屏。


---

## Render 部署（Web Service）

> Render 要求：使用 `process.env.PORT`（本项目已支持）

1. 将本项目推到你的 Git 仓库（GitHub/GitLab）
2. Render 控制台 → **New +** → **Web Service**
3. 选择仓库后按以下配置：
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. 点击 **Create Web Service**，等待构建并上线

可选：Render 会自动识别 `package.json` 的 `start` 脚本。

---

## 目录结构

```
/server
  index.js
/public
  index.html
  /css
    styles.css
  /js
    main.js
    /modules
      audio.js
      engine.js
      input.js
      renderer.js
      state.js
      theme.js
      ui.js
      utils.js
README.md
package.json
```

---

## 玩法提示

- 点击屏幕方向键或滑动即可开始移动（同时会激活音频上下文）
- 速度会随分数逐渐提升
- 撞墙/撞到自己会失败，点击“重新开始”即可再次游戏
