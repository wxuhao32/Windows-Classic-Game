# 坦克大战（Web / Canvas）

技术栈：Vite + React + TypeScript + Canvas + 自研 GameEngine（纯前端静态资源，可 iframe 集成）。

## 本地运行（推荐 npm）

> Node.js 版本建议：**18+**（Vite 5 需要 Node 18 / 20+）。

```bash
npm install
npm run dev
```

打开终端提示的本地地址即可。

## 打包构建

```bash
npm run build
```

构建产物在 `dist/`，可直接放到你的静态站点/游戏大厅里 iframe 加载。

## 游戏大厅控制接口

页面启动后会在 `window` 上挂载：

```ts
window.tankGame = {
  start(),
  pause(),
  resume(),
  reset(),
  destroy()
}
```
