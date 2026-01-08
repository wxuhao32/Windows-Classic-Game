const path = require("path");
const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

// Static assets
app.use(express.static(path.join(__dirname, "..", "public")));

// Health check
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// SPA-ish fallback (optional)
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[snake-arcade] listening on port ${PORT}`);
});
