import {
  OpError,
  ServerMsg,
  SyncGapError,
  applyOp,
  initialState,
  receiveCommit,
  receiveReject,
  submitLocal,
  type ClientMsg,
  type Dropped,
  type LayoutDoc,
  type Op,
  type Role,
  type SyncState,
} from '@field-form/shared';
import { randomUUID } from 'expo-crypto';
import { createStore } from 'zustand/vanilla';

export type SyncStatus = 'connecting' | 'syncing' | 'online' | 'offline';

export interface SyncSnapshot {
  view: LayoutDoc;
  status: SyncStatus;
  pendingCount: number;
  lastSeq: number;
  /** Explanation of the latest dropped edit. Always reported, so Dana knows to redo it. */
  notice: string | null;
}

const MAX_BACKOFF_MS = 10_000;

/**
 * Socket wrapper around the shared sync state machine. All contract rules live in
 * `@field-form/shared/sync-state`; this class only moves messages and schedules reconnects.
 * `state` lives in memory for now; it survives reconnects but not an app restart.
 */
export class SyncClient {
  readonly store = createStore<SyncSnapshot>(() => ({
    view: null,
    status: 'connecting',
    pendingCount: 0,
    lastSeq: 0,
    notice: null,
  }));

  private state: SyncState<LayoutDoc, Op> = initialState<LayoutDoc, Op>(null);
  private ws: WebSocket | null = null;
  private ready = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly url: string,
    private readonly layoutId: string,
    private readonly clientId: string,
    private readonly role: Role,
  ) {}

  /** Apply locally and send. Returns an error message if the edit is invalid right now. */
  submit = (op: Op): string | null => {
    const pending = { opId: randomUUID(), op };
    try {
      this.state = submitLocal(this.state, pending, applyOp);
    } catch (e) {
      if (e instanceof OpError) return e.message;
      throw e;
    }
    if (this.ready) this.send({ type: 'submit', ...pending });
    this.publish();
    return null;
  };

  /** Connect and keep reconnecting until `stop()`. Safe to call again after `stop()`. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.attempt = 0;
    this.open();
  }

  /** Disconnect and stop reconnecting. Local state is kept, so a later `start()` resumes from `lastSeq`. */
  stop(): void {
    this.running = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private open(): void {
    this.ready = false;
    this.store.setState({ status: this.attempt === 0 ? 'connecting' : 'offline' });
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.store.setState({ status: 'syncing' });
      this.send({
        type: 'hello',
        layoutId: this.layoutId,
        clientId: this.clientId,
        role: this.role,
        lastSeq: this.state.lastSeq,
      });
    };
    ws.onmessage = (e) => this.handle(String(e.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ready = false;
      this.store.setState({ status: 'offline' });
      if (this.running) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    // Exponential backoff with jitter (capped) so many devices don't reconnect in lockstep after an outage.
    const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => this.open(), base / 2 + Math.random() * (base / 2));
  }

  private handle(raw: string): void {
    const parsed = ServerMsg.safeParse(JSON.parse(raw));
    if (!parsed.success) return;
    const msg = parsed.data;

    switch (msg.type) {
      case 'commit': {
        if (msg.layoutId !== this.layoutId) return;
        try {
          const t = receiveCommit(this.state, msg, applyOp);
          this.state = t.state;
          this.report(t.dropped);
        } catch (e) {
          if (e instanceof SyncGapError) {
            this.ws?.close(); // reconnect replays from lastSeq
            return;
          }
          throw e;
        }
        break;
      }
      case 'ready':
        this.ready = true;
        this.attempt = 0;
        this.store.setState({ status: 'online' });
        // Resubmit everything still pending, in order. Known opIds are deduplicated by the server.
        for (const p of this.state.pending) this.send({ type: 'submit', ...p });
        break;
      case 'reject': {
        const t = receiveReject(this.state, msg, applyOp);
        this.state = t.state;
        this.report(t.dropped);
        break;
      }
    }
    this.publish();
  }

  private report(dropped: Dropped<Op>[]): void {
    const [first, ...rest] = dropped;
    if (!first) return;
    const more = rest.length ? ` …and ${rest.length} related edit${rest.length > 1 ? 's' : ''}` : '';
    this.store.setState({ notice: `Couldn't apply ${first.op.t}: ${first.reason}${more}` });
  }

  private publish(): void {
    this.store.setState({
      view: this.state.view,
      pendingCount: this.state.pending.length,
      lastSeq: this.state.lastSeq,
    });
  }

  private send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
