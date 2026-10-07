import { API_BASE_URL } from './api';

type Handler = (payload: any) => void;

class WsManager {
  private socket: WebSocket | null = null;
  private subs = new Map<string, Set<Handler>>();
  private rooms = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token = '';
  private intentionalClose = false;

  connect(token: string) {
    this.token = token;
    this.intentionalClose = false;
    this._open();
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
    this.rooms.clear();
  }

  joinRoom(room: string) {
    this.rooms.add(room);
    this._send({ type: 'join_room', room });
  }

  leaveRoom(room: string) {
    this.rooms.delete(room);
    this._send({ type: 'leave_room', room });
  }

  sendTyping(room: string) {
    this._send({ type: 'typing', room });
  }

  // Returns an unsubscribe function
  on(event: string, handler: Handler): () => void {
    if (!this.subs.has(event)) this.subs.set(event, new Set());
    this.subs.get(event)!.add(handler);
    return () => this.subs.get(event)?.delete(handler);
  }

  private _open() {
    const url = API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
    try {
      this.socket = new WebSocket(`${url}/api/v1/ws?token=${this.token}`);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      // Rejoin all rooms after (re)connect
      this.rooms.forEach(r => this._send({ type: 'join_room', room: r }));
    };

    this.socket.onmessage = (e) => {
      const lines = (e.data as string).split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this.subs.get(msg.type)?.forEach(h => h(msg.payload));
        } catch {}
      }
    };

    this.socket.onclose = () => {
      if (!this.intentionalClose) this._scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private _send(msg: object) {
    if (this.socket?.readyState === 1 /* OPEN */) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private _scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => this._open(), 3000);
  }
}

export const wsManager = new WsManager();
