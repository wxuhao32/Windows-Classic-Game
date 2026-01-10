import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { setupMultiplayer } from "./multiplayer.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // WebSocket: 联机对战（权威服务器）
  setupMultiplayer(server);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // 开发环境下，前端由 Vite dev server 提供（默认 3000）。
  // 这里的后端默认跑 3001，仅提供 WebSocket/生产静态资源。
  const port = Number(
    process.env.PORT || (process.env.NODE_ENV === "production" ? 3000 : 3001)
  );

  // 仅在生产环境提供静态资源；开发用 Vite
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(staticPath));

    // Handle client-side routing - serve index.html for all routes
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  } else {
    app.get("/health", (_req, res) => res.json({ ok: true }));
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`WebSocket: ws://localhost:${port}/ws`);
  });
}

startServer().catch(console.error);
