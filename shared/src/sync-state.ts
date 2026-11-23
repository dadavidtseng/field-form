// Client sync state machine. The server orders every edit; the client shows
// `confirmed` (server commits) with its own unacknowledged `pending` edits on top.
// Pure and generic over the document and op types, so it is unit-testable
// without a socket and unchanged as the domain grows.

export type Apply<D, O> = (doc: D, op: O) => D;

export interface Pending<O> {
  opId: string;
  op: O;
}

export interface SyncState<D, O> {
  /** Document built only from server commits, in seq order. */
  confirmed: D;
  /** Highest seq applied to `confirmed`. */
  lastSeq: number;
  /** Local ops not yet committed, in submission order. */
  pending: Pending<O>[];
  /** What the user sees: `confirmed` with `pending` re-applied on top. */
  view: D;
}

export interface Dropped<O> extends Pending<O> {
  reason: string;
}

export interface Transition<D, O> {
  state: SyncState<D, O>;
  /** Pending ops removed because they were rejected or now fail. Never silent: callers must surface these. */
  dropped: Dropped<O>[];
}

/** A commit arrived with seq > lastSeq + 1: ops are missing, so the client must reconnect and replay. */
export class SyncGapError extends Error {
  constructor(expected: number, got: number) {
    super(`Expected seq ${expected}, got ${got}`);
    this.name = 'SyncGapError';
  }
}

export function initialState<D, O>(doc: D): SyncState<D, O> {
  return { confirmed: doc, lastSeq: 0, pending: [], view: doc };
}

/** Apply a new local op optimistically. Throws (and changes nothing) if it fails on the current view. */
export function submitLocal<D, O>(s: SyncState<D, O>, p: Pending<O>, apply: Apply<D, O>): SyncState<D, O> {
  const view = apply(s.view, p.op);
  return { ...s, pending: [...s.pending, p], view };
}

/** Rules 1–4 of the commit contract. */
export function receiveCommit<D, O>(
  s: SyncState<D, O>,
  c: { seq: number; opId: string; op: O },
  apply: Apply<D, O>,
): Transition<D, O> {
  if (c.seq <= s.lastSeq) return { state: s, dropped: [] }; // 1. already applied
  if (c.seq !== s.lastSeq + 1) throw new SyncGapError(s.lastSeq + 1, c.seq);
  const confirmed = apply(s.confirmed, c.op); // 2. server order is authoritative
  const pending = s.pending.filter((p) => p.opId !== c.opId); // 3. our own op came back
  return rebuild({ ...s, confirmed, lastSeq: c.seq, pending }, apply); // 4.
}

/** Remove a rejected op, then drop any pending op that depended on it. */
export function receiveReject<D, O>(
  s: SyncState<D, O>,
  r: { opId: string; message: string },
  apply: Apply<D, O>,
): Transition<D, O> {
  const rejected = s.pending.find((p) => p.opId === r.opId);
  if (!rejected) return { state: s, dropped: [] };
  const pending = s.pending.filter((p) => p.opId !== r.opId);
  return rebuild({ ...s, pending }, apply, [{ ...rejected, reason: r.message }]);
}

function rebuild<D, O>(s: SyncState<D, O>, apply: Apply<D, O>, dropped: Dropped<O>[] = []): Transition<D, O> {
  let view = s.confirmed;
  const kept: Pending<O>[] = [];
  for (const p of s.pending) {
    try {
      view = apply(view, p.op);
      kept.push(p);
    } catch (e) {
      dropped.push({ ...p, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { state: { ...s, pending: kept, view }, dropped };
}
