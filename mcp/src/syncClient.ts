import { randomUUID } from 'node:crypto';
import {
  ServerMsg,
  applyOp,
  type ClientMsg,
  type LayoutDoc,
  type LayoutSummary,
  type Op,
  type RejectCode,
} from '@field-form/shared';

const TIMEOUT_MS = 5_000;

/** One short-lived WebSocket that buffers validated server messages and lets callers await one. */
async function connect(url: string) {
  const ws = new WebSocket(url);
  const inbox: ServerMsg[] = [];
  const waiters: { match: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];

  ws.addEventListener('message', (event) => {
    let json: unknown;
    try {
      json = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const parsed = ServerMsg.safeParse(json);
    if (!parsed.success) return;
    const waiter = waiters.findIndex((w) => w.match(parsed.data));
    if (waiter >= 0) waiters.splice(waiter, 1)[0]!.resolve(parsed.data);
    else inbox.push(parsed.data);
  });

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error(`Cannot reach the Field Form sync server at ${url}`)), {
      once: true,
    });
  });

  return {
    send: (msg: ClientMsg) => ws.send(JSON.stringify(msg)),
    /** Every message received so far that matches, removed from the buffer. */
    drain: (match: (m: ServerMsg) => boolean) => {
      const out = inbox.filter(match);
      for (const m of out) inbox.splice(inbox.indexOf(m), 1);
      return out;
    },
    next: (match: (m: ServerMsg) => boolean) =>
      new Promise<ServerMsg>((resolve, reject) => {
        const buffered = inbox.findIndex(match);
        if (buffered >= 0) return resolve(inbox.splice(buffered, 1)[0]!);
        const timer = setTimeout(() => reject(new Error('The sync server did not answer in time')), TIMEOUT_MS);
        waiters.push({
          match,
          resolve: (m) => {
            clearTimeout(timer);
            resolve(m);
          },
        });
      }),
    close: () => ws.close(),
  };
}

export type SubmitResult = { ok: true } | { ok: false; code: RejectCode; message: string };

/**
 * Claude's view of Field Form: an ordinary sync client in the **office** role, so the server's
 * rules apply unchanged. It can read everything and comment, and can never change geometry or
 * measurements, whatever it is asked to do.
 */
export class FieldFormClient {
  private readonly clientId = `claude-${randomUUID()}`;

  constructor(private readonly url: string) {}

  async listSpaces(): Promise<LayoutSummary[]> {
    const conn = await connect(this.url);
    try {
      conn.send({ type: 'watchIndex', clientId: this.clientId, role: 'office' });
      const msg = await conn.next((m) => m.type === 'index');
      return msg.type === 'index' ? msg.layouts : [];
    } finally {
      conn.close();
    }
  }

  /** The space as it is now: every commit replayed through the same reducer the apps use. */
  async loadSpace(layoutId: string): Promise<LayoutDoc> {
    const conn = await connect(this.url);
    try {
      conn.send({ type: 'hello', layoutId, clientId: this.clientId, role: 'office', lastSeq: 0 });
      await conn.next((m) => m.type === 'ready');
      let doc: LayoutDoc = null;
      for (const c of conn.drain((m) => m.type === 'commit')) if (c.type === 'commit') doc = applyOp(doc, c.op);
      return doc;
    } finally {
      conn.close();
    }
  }

  /** Send one edit and wait for the server's verdict: committed, or rejected with a reason. */
  async submit(layoutId: string, op: Op): Promise<SubmitResult> {
    const conn = await connect(this.url);
    try {
      conn.send({ type: 'hello', layoutId, clientId: this.clientId, role: 'office', lastSeq: 0 });
      await conn.next((m) => m.type === 'ready');
      const opId = randomUUID();
      conn.send({ type: 'submit', opId, op });
      const verdict = await conn.next((m) => (m.type === 'commit' || m.type === 'reject') && m.opId === opId);
      return verdict.type === 'reject' ? { ok: false, code: verdict.code, message: verdict.message } : { ok: true };
    } finally {
      conn.close();
    }
  }
}
