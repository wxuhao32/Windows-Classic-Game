import type { WebSocket } from 'ws';

export type PlayerRole = 'host' | 'guest';

export interface ClientInfo {
  id: string;
  ws: WebSocket;
  roomId?: string;
  seat?: 1 | 2;
  nickname?: string;
  role?: PlayerRole;
  lastSeen: number;
}

export interface RoomInfo {
  mode: 'pvp' | 'coop';
  id: string;
  password: string;
  createdAt: number;
  hostClientId: string;
  clients: Map<string, ClientInfo>; // clientId -> info
}

export interface SendFn {
  (ws: WebSocket, data: unknown): void;
}

export class RoomManager {
  private rooms = new Map<string, RoomInfo>();
  private send: SendFn;

  constructor(send: SendFn) {
    this.send = send;
    // periodic cleanup
    setInterval(() => this.cleanup(), 60_000).unref?.();
  }

  createRoom(roomId: string, password: string, host: ClientInfo, mode: 'pvp' | 'coop'): RoomInfo {
    const id = roomId.trim();
    if (!id) throw new Error('房间号不能为空');
    if (this.rooms.has(id)) throw new Error('房间号已存在');
    const room: RoomInfo = {
        mode,
      id,
      password,
      createdAt: Date.now(),
      hostClientId: host.id,
      clients: new Map(),
    };
    this.rooms.set(id, room);
    this.joinRoom(id, password, host, 'host');
    return room;
  }

  joinRoom(roomId: string, password: string, client: ClientInfo, role: PlayerRole = 'guest'): RoomInfo {
    const id = roomId.trim();
    const room = this.rooms.get(id);
    if (!room) throw new Error('房间不存在');
    if (room.password !== password) throw new Error('密码错误');
    if (room.clients.size >= 2 && !room.clients.has(client.id)) throw new Error('房间已满（最多 2 人）');

    // assign seat
    const used = new Set(Array.from(room.clients.values()).map(c => c.seat));
    const seat: 1 | 2 = used.has(1) ? 2 : 1;

    client.roomId = id;
    client.seat = seat;
    client.role = role;
    room.clients.set(client.id, client);

    // notify existing
    for (const other of room.clients.values()) {
      if (other.id === client.id) continue;
      this.send(other.ws, { type: 'playerJoined', roomId: id, playerId: client.id, seat, nickname: client.nickname || '' });
    }
    return room;
  }

  leave(client: ClientInfo) {
    const roomId = client.roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.clients.delete(client.id);

    for (const other of room.clients.values()) {
      this.send(other.ws, { type: 'playerLeft', roomId, playerId: client.id });
    }

    if (room.clients.size === 0) {
      this.rooms.delete(roomId);
      return;
    }
    // if host left, promote remaining client to host
    if (room.hostClientId === client.id) {
      const next = Array.from(room.clients.values())[0];
      room.hostClientId = next.id;
      next.role = 'host';
      this.send(next.ws, { type: 'hostPromoted', roomId, playerId: next.id });
    }
    client.roomId = undefined;
    client.seat = undefined;
    client.role = undefined;
  }

  getRoom(roomId: string): RoomInfo | undefined {
    return this.rooms.get(roomId);
  }

  cleanup() {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      // remove stale rooms older than 6h with no clients
      if (room.clients.size === 0 && now - room.createdAt > 6 * 3600_000) {
        this.rooms.delete(id);
      }
    }
  }
}
