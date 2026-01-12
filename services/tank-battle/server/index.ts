import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { RoomManager, type ClientInfo } from './multiplayer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 静态资源：Vite build 输出到 dist/public
const publicDir = path.resolve(__dirname, '../dist/public');
app.use(express.static(publicDir, { maxAge: '1h' }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = http.createServer(app);

function send(ws: any, data: unknown) {
  try {
    ws.send(JSON.stringify(data));
  } catch {}
}

const rooms = new RoomManager(send);

const wss = new WebSocketServer({ server, path: '/ws' });

let clientSeq = 0;

wss.on('connection', (ws) => {
  const clientId = `c${++clientSeq}_${Math.random().toString(16).slice(2, 8)}`;
  const client: ClientInfo = { id: clientId, ws, lastSeen: Date.now() };

  send(ws, { type: 'hello', playerId: clientId });

  ws.on('message', (buf) => {
    client.lastSeen = Date.now();
    let msg: any;
    try { msg = JSON.parse(String(buf)); } catch { return; }

    const t = msg?.type;

    try {
      if (t === 'create') {
        const roomId = String(msg.roomId || '').trim();
        const password = String(msg.password || '').trim();
        client.nickname = String(msg.nickname || '').slice(0, 16);
        const mode = (String(msg.mode || 'pvp') === 'coop') ? 'coop' : 'pvp';
          const room = rooms.createRoom(roomId, password, client, mode);
        send(ws, { type: 'created', roomId: room.id, playerId: clientId, seat: client.seat, role: 'host', mode: room.mode });
        return;
      }

      if (t === 'join') {
        const roomId = String(msg.roomId || '').trim();
        const password = String(msg.password || '').trim();
        client.nickname = String(msg.nickname || '').slice(0, 16);
        const room = rooms.joinRoom(roomId, password, client, 'guest');
        send(ws, { type: 'joined', roomId: room.id, playerId: clientId, seat: client.seat, role: 'guest', hostId: room.hostClientId, mode: room.mode });

        // inform guest about existing player (host)
        for (const other of room.clients.values()) {
          if (other.id === client.id) continue;
          send(ws, { type: 'playerJoined', roomId: room.id, playerId: other.id, seat: other.seat, nickname: other.nickname || '' });
        }
        return;
      }

      if (t === 'leave') {
        rooms.leave(client);
        send(ws, { type: 'left' });
        return;
      }

      // relay input -> host only
      if (t === 'input') {
        const roomId = String(msg.roomId || '').trim();
        const room = rooms.getRoom(roomId);
        if (!room) return;
        // find host
        const host = room.clients.get(room.hostClientId);
        if (!host) return;
        // attach sender id
        send(host.ws, { type: 'input', roomId, playerId: client.id, seat: client.seat, seq: msg.seq ?? 0, input: msg.input });
        return;
      }

      // relay state -> all guests (from host)
      if (t === 'state') {
        const roomId = String(msg.roomId || '').trim();
        const room = rooms.getRoom(roomId);
        if (!room) return;
        if (room.hostClientId !== client.id) return; // only host can publish state
        for (const other of room.clients.values()) {
          if (other.id === client.id) continue;
          send(other.ws, { type: 'state', roomId, tick: msg.tick ?? 0, snapshot: msg.snapshot });
        }
        return;
      }

      if (t === 'ping') {
        send(ws, { type: 'pong', t: msg.t ?? 0 });
        return;
      }
    } catch (e: any) {
      send(ws, { type: 'error', message: e?.message || '请求失败' });
    }
  });

  ws.on('close', () => {
    rooms.leave(client);
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`[tank-battle] server listening on :${port}`);
});
