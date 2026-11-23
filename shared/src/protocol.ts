import { z } from 'zod';
import { Op } from './ops';

// Wire protocol (DESIGN.md §7). Every message is JSON with a `type` field.
// The server validates client messages with these schemas (rejection layer 1).

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

export const ClientMsg = z.discriminatedUnion('type', [Hello, Submit]);
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

export const ServerMsg = z.discriminatedUnion('type', [Commit, Ready, Reject]);
export type ServerMsg = z.infer<typeof ServerMsg>;

/** Rejection layer 2: which roles may send which ops. Office may only send comment ops (none exist yet). */
export function canSend(role: Role, op: Op): boolean {
  void op;
  return role === 'field';
}
