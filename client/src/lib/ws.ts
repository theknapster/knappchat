import type { ChatMessage, OnlineUser } from './api';

type ServerEvent =
  | { type: 'history'; messages: ChatMessage[] }
  | { type: 'message'; message: ChatMessage }
  | { type: 'presence'; users: OnlineUser[] }
  | { type: 'renamed'; userId: string; name: string };

export interface ChatSocketHandlers {
  onHistory: (messages: ChatMessage[]) => void;
  onMessage: (message: ChatMessage) => void;
  onPresence: (users: OnlineUser[]) => void;
  onRenamed: (userId: string, name: string) => void;
  onStatusChange: (status: 'connecting' | 'open' | 'closed') => void;
}

const MAX_BACKOFF_MS = 10_000;

export class ChatSocket {
  private socket: WebSocket | null = null;
  private closedByUser = false;
  private backoffMs = 500;
  private handlers: ChatSocketHandlers;

  constructor(handlers: ChatSocketHandlers) {
    this.handlers = handlers;
  }

  connect() {
    this.closedByUser = false;
    this.open();
  }

  private open() {
    this.handlers.onStatusChange('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    this.socket = socket;

    socket.onopen = () => {
      this.backoffMs = 500;
      this.handlers.onStatusChange('open');
    };

    socket.onmessage = (event) => {
      const data: ServerEvent = JSON.parse(event.data);
      if (data.type === 'history') this.handlers.onHistory(data.messages);
      if (data.type === 'message') this.handlers.onMessage(data.message);
      if (data.type === 'presence') this.handlers.onPresence(data.users);
      if (data.type === 'renamed') this.handlers.onRenamed(data.userId, data.name);
    };

    socket.onclose = () => {
      this.handlers.onStatusChange('closed');
      if (this.closedByUser) return;
      setTimeout(() => this.open(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    };
  }

  send(body: string) {
    this.socket?.send(JSON.stringify({ type: 'send', body }));
  }

  close() {
    this.closedByUser = true;
    this.socket?.close();
  }
}
