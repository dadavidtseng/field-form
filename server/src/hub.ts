import {
  ClientMsg,
  OpError,
  applyOp,
  canSend,
  type Commit,
  type LayoutDoc,
  type LayoutSummary,
  type RejectCode,
  type Role,
  type ServerMsg,
} from '@field-form/shared';
import type { CommitStore, StoredCommit } from './store';

type Send = (msg: ServerMsg) => void;
type Log = (line: string) => void;

interface Subscriber {
  layoutId: string;
  clientId: string;
  role: Role;
  send: Send;
}

interface LayoutCache {
  doc: LayoutDoc;
  seq: number;
  updatedAt: number;
}

const toWire = (c: StoredCommit): Commit => ({ type: 'commit', ...c });

/**
 * Transport-independent sync logic: validates, orders, persists and broadcasts edits,
 * and keeps every list screen up to date. The WebSocket layer only moves strings in
 * and out, so every rule is testable without sockets.
 */
export class Hub {
  private readonly subscribers = new Set<Subscriber>();
  private readonly indexWatchers = new Set<Send>();
  private readonly cache = new Map<string, LayoutCache>();

  constructor(
    private readonly store: CommitStore,
    private readonly log: Log = () => {},
    private readonly now: () => number = Date.now,
  ) {}

  connect(send: Send): { receive(raw: string): void; close(): void } {
    let sub: Subscriber | null = null;

    const reject = (opId: string, code: RejectCode, message: string) => {
      this.log(`reject ${code} op=${opId}: ${message}`);
      send({ type: 'reject', opId, code, message });
    };

    const unsubscribe = () => {
      if (!sub) return;
      this.subscribers.delete(sub);
      if (sub.role === 'field') this.broadcastIndex(); // "live" may have changed
      sub = null;
    };

    return {
      receive: (raw) => {
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          this.log('ignored non-JSON message');
          return;
        }

        // Layer 1: format.
        const parsed = ClientMsg.safeParse(json);
        if (!parsed.success) {
          const opId = (json as { opId?: unknown })?.opId;
          if (typeof opId === 'string') reject(opId, 'invalid', parsed.error.issues[0]?.message ?? 'invalid');
          else this.log('ignored malformed message without opId');
          return;
        }
        const msg = parsed.data;

        if (msg.type === 'watchIndex') {
          this.indexWatchers.add(send);
          send(this.index());
          return;
        }

        if (msg.type === 'hello') {
          unsubscribe();
          sub = { layoutId: msg.layoutId, clientId: msg.clientId, role: msg.role, send };
          this.subscribers.add(sub);
          // Replay, never snapshot: a lost ack comes back as an ordinary commit.
          const missed = this.store.since(msg.layoutId, msg.lastSeq);
          for (const c of missed) send(toWire(c));
          send({ type: 'ready', layoutId: msg.layoutId, headSeq: this.layout(msg.layoutId).seq });
          if (msg.role === 'field') this.broadcastIndex();
          this.log(`hello ${msg.role} ${msg.clientId} layout=${msg.layoutId} replayed=${missed.length}`);
          return;
        }

        if (!sub) return reject(msg.opId, 'invalid', 'Send hello before submitting');

        // Idempotency: a known opId returns its original commit and is never applied twice.
        const known = this.store.byOpId(msg.opId);
        if (known) return send(toWire(known));

        // Layer 2: permission.
        if (!canSend(sub.role, msg.op)) {
          return reject(msg.opId, 'forbidden', `The ${sub.role} role cannot send ${msg.op.t}`);
        }

        // Layer 3: domain preconditions, then commit.
        const layout = this.layout(sub.layoutId);
        let doc: LayoutDoc;
        try {
          doc = applyOp(layout.doc, msg.op);
        } catch (e) {
          if (e instanceof OpError) return reject(msg.opId, 'conflict', e.message);
          throw e;
        }
        const commit: StoredCommit = {
          layoutId: sub.layoutId,
          seq: layout.seq + 1,
          opId: msg.opId,
          clientId: sub.clientId,
          op: msg.op,
          at: this.now(),
        };
        this.store.append(commit); // persisted before anyone is told
        layout.doc = doc;
        layout.seq = commit.seq;
        layout.updatedAt = commit.at;
        const wire = toWire(commit);
        for (const s of this.subscribers) if (s.layoutId === commit.layoutId) s.send(wire);
        this.broadcastIndex();
      },
      close: () => {
        this.indexWatchers.delete(send);
        unsubscribe();
      },
    };
  }

  /** Every created layout, most recently edited first. */
  private index(): ServerMsg {
    const layouts: LayoutSummary[] = [];
    for (const id of this.store.layoutIds()) {
      const { doc, updatedAt } = this.layout(id);
      if (!doc) continue;
      const live = [...this.subscribers].some((s) => s.layoutId === id && s.role === 'field');
      layouts.push({ id, name: doc.name, kind: doc.kind, updatedAt, walls: doc.outline.walls.length, live });
    }
    layouts.sort((a, b) => b.updatedAt - a.updatedAt);
    return { type: 'index', layouts };
  }

  private broadcastIndex(): void {
    if (this.indexWatchers.size === 0) return;
    const msg = this.index();
    for (const send of this.indexWatchers) send(msg);
  }

  /** Current server-side document for a layout, rebuilt from the log on first use. */
  private layout(layoutId: string): LayoutCache {
    let entry = this.cache.get(layoutId);
    if (!entry) {
      entry = { doc: null, seq: 0, updatedAt: 0 };
      for (const c of this.store.since(layoutId, 0)) {
        entry.doc = applyOp(entry.doc, c.op);
        entry.seq = c.seq;
        entry.updatedAt = c.at;
      }
      this.cache.set(layoutId, entry);
    }
    return entry;
  }
}
