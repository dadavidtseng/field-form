import {
  OpError,
  SyncGapError,
  applyOp,
  initialState,
  receiveCommit,
  receiveReject,
  submitLocal,
  type Dropped,
  type LayoutDoc,
  type Op,
  type Role,
  type ServerMsg,
  type SyncState,
} from '@field-form/shared';
import { randomUUID } from 'expo-crypto';
import { createStore } from 'zustand/vanilla';
import { ReconnectingSocket } from './ReconnectingSocket';

export type SyncStatus = 'connecting' | 'syncing' | 'online' | 'offline';

export interface SyncSnapshot {
  view: LayoutDoc;
  status: SyncStatus;
  pendingCount: number;
  lastSeq: number;
  /** Explanation of the latest dropped edit. Always reported, so Dana knows to redo it. */
  notice: string | null;
}

/**
 * Connects one layout to the shared sync state machine. All ordering, replay and rejection
 * rules live in `@field-form/shared`; this class only feeds it messages.
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
  private ready = false;
  private readonly socket: ReconnectingSocket;

  constructor(
    url: string,
    private readonly layoutId: string,
    private readonly clientId: string,
    private readonly role: Role,
  ) {
    this.socket = new ReconnectingSocket(url, {
      onOpen: () => this.socket.send({ type: 'hello', layoutId, clientId, role, lastSeq: this.state.lastSeq }),
      onMessage: (msg) => this.handle(msg),
      onStatus: (s) => {
        if (s !== 'open') this.ready = false;
        this.store.setState({ status: s === 'open' ? 'syncing' : s });
      },
    });
  }

  start(): void {
    this.socket.start();
  }

  /** Local state is kept, so a later `start()` resumes from `lastSeq`. */
  stop(): void {
    this.socket.stop();
  }

  /** Apply locally and send. Returns an error message if the edit is invalid right now. */
  submit = (op: Op): string | null => {
    const pending = { opId: randomUUID(), op };
    try {
      this.state = submitLocal(this.state, pending, applyOp);
    } catch (e) {
      if (e instanceof OpError) return e.message;
      throw e;
    }
    if (this.ready) this.socket.send({ type: 'submit', ...pending });
    this.publish();
    return null;
  };

  private handle(msg: ServerMsg): void {
    switch (msg.type) {
      case 'commit': {
        if (msg.layoutId !== this.layoutId) return;
        try {
          const t = receiveCommit(this.state, msg, applyOp);
          this.state = t.state;
          this.report(t.dropped);
        } catch (e) {
          if (e instanceof SyncGapError) return this.socket.reconnect(); // replay from lastSeq
          throw e;
        }
        break;
      }
      case 'ready':
        this.ready = true;
        this.store.setState({ status: 'online' });
        // Resubmit everything still pending, in order. Known opIds are deduplicated by the server.
        for (const p of this.state.pending) this.socket.send({ type: 'submit', ...p });
        break;
      case 'reject': {
        const t = receiveReject(this.state, msg, applyOp);
        this.state = t.state;
        this.report(t.dropped);
        break;
      }
      case 'index':
        return;
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
}
