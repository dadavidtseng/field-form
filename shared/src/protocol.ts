import { z } from 'zod';
import { LayoutKind } from './model';
import { Op } from './ops';

// Wire protocol between app and sync server. Every message is JSON with a `type` field.
// Client messages are untrusted: the server validates them with these schemas before
// anything else, so malformed input is rejected as `invalid` instead of reaching the reducer.

export const SYNC_PORT = 8787;

const Id = z.string().min(1).max(64);
const Seq = z.number().int().min(0);

export const Role = z.enum(['field', 'office']);
export type Role = z.infer<typeof Role>;

export const RejectCode = z.enum(['invalid', 'forbidden', 'conflict']);
export type RejectCode = z.infer<typeof RejectCode>;

// ---- client → server ----

export const Hello = z.object({
  type: z.literal('hello'),
  layoutId: Id,
  clientId: Id,
  role: Role,
  lastSeq: Seq,
});

export const Submit = z.object({
  type: z.literal('submit'),
  opId: Id,
  op: Op,
});

/** Subscribe to the live list of layouts (both roles start on the layout list). */
export const WatchIndex = z.object({
  type: z.literal('watchIndex'),
  clientId: Id,
  role: Role,
});

export const ClientMsg = z.discriminatedUnion('type', [Hello, Submit, WatchIndex]);
export type ClientMsg = z.infer<typeof ClientMsg>;

// ---- server → client ----

/** The single authoritative envelope. Sent to every subscriber, author included (it doubles as the ack). */
export const Commit = z.object({
  type: z.literal('commit'),
  layoutId: Id,
  seq: Seq.min(1),
  opId: Id,
  clientId: Id,
  op: Op,
  at: z.number(),
});
export type Commit = z.infer<typeof Commit>;

/** Replay since `lastSeq` is complete; the client may now resubmit pending ops. */
export const Ready = z.object({
  type: z.literal('ready'),
  layoutId: Id,
  headSeq: Seq,
});

/** Sent to the author only. Rejected ops never get a seq and are never logged as commits. */
export const Reject = z.object({
  type: z.literal('reject'),
  opId: Id,
  code: RejectCode,
  message: z.string(),
});
export type Reject = z.infer<typeof Reject>;

export const LayoutSummary = z.object({
  id: Id,
  name: z.string(),
  kind: LayoutKind,
  updatedAt: z.number(),
  walls: z.number().int().nonnegative(),
  /** Closed shape (has an area) vs open line such as a fence (has a length). */
  closed: z.boolean(),
  /** A field device has this layout open right now. */
  live: z.boolean(),
});
export type LayoutSummary = z.infer<typeof LayoutSummary>;

/** The full list, most recently edited first. Re-sent whenever any entry changes; it is small. */
export const Index = z.object({
  type: z.literal('index'),
  layouts: z.array(LayoutSummary),
});

export const ServerMsg = z.discriminatedUnion('type', [Commit, Ready, Reject, Index]);
export type ServerMsg = z.infer<typeof ServerMsg>;

/** Rejection layer 2: which roles may send which ops. */
export function canSend(role: Role, op: Op): boolean {
  const ops = op.t === 'batch' ? op.ops : [op];
  return ops.every((o) => {
    // Nobody may post a comment in the other role's name.
    if (o.t === 'comment.add' && o.comment.by !== role) return false;
    // Comments are the office's only write path; the field may send everything.
    return role === 'field' || o.t.startsWith('comment.');
  });
}
