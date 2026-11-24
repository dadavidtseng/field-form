import {
  OpError,
  SyncGapError,
  applyOp,
  applyWithInverse,
  initialState,
  receiveCommit,
  receiveReject,
  restoreState,
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
import { sqliteStorage, type StateStorage } from './localStore';

export type SyncStatus = 'connecting' | 'syncing' | 'online' | 'offline';

export interface SyncSnapshot {
  view: LayoutDoc;
  status: SyncStatus;
  pendingCount: number;
  lastSeq: number;
  canUndo: boolean;
  /** Explanation of the latest dropped edit. Always reported, so Dana knows to redo it. */
  notice: string | null;
}

/**
 * Connects one layout to the shared sync state machine. All ordering, replay and rejection
 * rules live in `@field-form/shared`; this class only feeds it messages.
 * State is saved on the device after every change, so unsent edits survive an app restart.
 */
export class SyncClient {
  readonly store = createStore<SyncSnapshot>(() => ({
    view: null,
    status: 'connecting',
    pendingCount: 0,
    lastSeq: 0,
    canUndo: false,
    notice: null,
  }));

  private state: SyncState<LayoutDoc, Op> = initialState<LayoutDoc, Op>(null);
  private ready = false;
  private readonly undoStack: Op[] = [];
  private readonly socket: ReconnectingSocket;

  constructor(
    url: string,
    private readonly layoutId: string,
    private readonly clientId: string,
    private readonly role: Role,
    private readonly storage: StateStorage = sqliteStorage,
  ) {
    // Show what was saved on this device straight away, before (or without) a connection.
    const saved = this.tryStorage(() => storage.load(layoutId));
    if (saved) {
      const t = restoreState<LayoutDoc, Op>(saved.confirmed, saved.lastSeq, saved.pending, applyOp);
      this.state = t.state;
      this.report(t.dropped);
      this.publish();
    }
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
  submit = (op: Op, options: { undoable?: boolean } = {}): string | null => {
    const pending = { opId: randomUUID(), op };
    let inverse: Op;
    try {
      inverse = applyWithInverse(this.state.view, op).inverse;
      this.state = submitLocal(this.state, pending, applyOp);
    } catch (e) {
      if (e instanceof OpError) return e.message;
      throw e;
    }
    const emptyInverse = inverse.t === 'batch' && inverse.ops.length === 0;
    if (options.undoable !== false && !emptyInverse) this.undoStack.push(inverse);
    this.persist(); // saved before it can be sent, so a crash right after cannot lose it
    if (this.ready) this.socket.send({ type: 'submit', ...pending });
    this.publish();
    return null;
  };

  /**
   * Undo this device's last edit by sending its inverse as a new edit, so undo syncs like any
   * other change and history is never rewritten. Returns an error if it no longer applies.
   */
  undo = (): string | null => {
    const inverse = this.undoStack.pop();
    if (!inverse) return null;
    const error = this.submit(inverse, { undoable: false });
    this.publish();
    return error;
  };

  private handle(msg: ServerMsg): void {
    switch (msg.type) {
      case 'commit': {
        if (msg.layoutId !== this.layoutId) return;
        try {
          const t = receiveCommit(this.state, msg, applyOp);
          this.state = t.state;
          this.report(t.dropped);
          this.persist(); // new confirmed state, lastSeq and pending saved together
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
        this.persist();
        break;
      }
      case 'index':
        return;
    }
    this.publish();
  }

  private persist(): void {
    const { confirmed, lastSeq, pending } = this.state;
    this.tryStorage(() => this.storage.save(this.layoutId, { confirmed, lastSeq, pending }));
  }

  /**
   * Storage failing (e.g. a full disk) must not stop Dana working: edits still sync while
   * online, so warn instead of crashing.
   */
  private tryStorage<T>(fn: () => T): T | null {
    try {
      return fn();
    } catch (e) {
      console.warn('[sync] could not use on-device storage', e);
      this.store.setState({ notice: 'Could not save on this device. Edits still sync while online.' });
      return null;
    }
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
      canUndo: this.undoStack.length > 0,
    });
  }
}
