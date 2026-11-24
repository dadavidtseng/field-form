import { ServerMsg, type ClientMsg } from '@field-form/shared';
import { onNetworkBack } from './networkWatch';

export type SocketStatus = 'connecting' | 'open' | 'offline';

export interface SocketHandlers {
  /** Connected (again): send the opening message, e.g. `hello` with the current `lastSeq`. */
  onOpen(): void;
  onMessage(msg: ServerMsg): void;
  onStatus(status: SocketStatus): void;
}

const MAX_BACKOFF_MS = 10_000;

/**
 * A WebSocket that keeps reconnecting while started, and only ever delivers messages
 * that match the server schema. Shared by the layout list and the per-layout sync client.
 */
export class ReconnectingSocket {
  private ws: WebSocket | null = null;
  private running = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopWatchingNetwork: (() => void) | null = null;

  constructor(
    private readonly url: string,
    private readonly handlers: SocketHandlers,
  ) {}

  /** Connect and keep reconnecting until `stop()`. Idempotent. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.stopWatchingNetwork = onNetworkBack(() => this.retryNow());
    this.open();
  }

  /** Disconnect and stop reconnecting. Idempotent. */
  stop(): void {
    this.running = false;
    this.stopWatchingNetwork?.();
    this.stopWatchingNetwork = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  /**
   * The network just came back: skip the remaining backoff and connect now. Does nothing
   * while a connection is open or already being made.
   */
  private retryNow(): void {
    if (!this.running || !this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempt = 0;
    this.open();
  }

  /** Drop the current connection and reconnect, e.g. to replay after a sequence gap. */
  reconnect(): void {
    this.ws?.close();
  }

  /** Sent only while connected; callers resend on the next `onOpen`. */
  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private open(): void {
    this.handlers.onStatus(this.attempt === 0 ? 'connecting' : 'offline');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus('open');
      this.handlers.onOpen();
    };
    ws.onmessage = (e) => {
      let json: unknown;
      try {
        json = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const parsed = ServerMsg.safeParse(json);
      if (parsed.success) this.handlers.onMessage(parsed.data);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // replaced or stopped
      this.handlers.onStatus('offline');
      if (this.running) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    // Exponential backoff with jitter (capped) so many devices don't reconnect in lockstep after an outage.
    const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(
      () => {
        // Cleared first: a pending timer is how retryNow() knows a reconnect is still waiting.
        this.retryTimer = null;
        this.open();
      },
      base / 2 + Math.random() * (base / 2),
    );
  }
}
