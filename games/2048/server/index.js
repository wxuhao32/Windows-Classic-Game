'use strict';

const path = require('path');
const express = require('express');

const app = express();

// Render sets PORT; locally default to 3000
const PORT = Number(process.env.PORT) || 3000;

// Static files
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  extensions: ['html']
}));

// Basic health route
app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Single page app fallback (optional, keeps it robust if you add routes later)
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[retro-2048] listening on http://localhost:${PORT}`);
});
