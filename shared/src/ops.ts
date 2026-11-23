import { z } from 'zod';

// Skeleton domain: just enough to prove the sync pipeline end to end.
// Walls, features and batches arrive in build step 2 (DESIGN.md §6).

export const LayoutKind = z.enum(['room', 'deck', 'patio', 'fence', 'other']);
export type LayoutKind = z.infer<typeof LayoutKind>;

const Name = z.string().trim().min(1).max(120);

export const Op = z.discriminatedUnion('t', [
  z.object({ t: z.literal('layout.create'), name: Name, kind: LayoutKind }),
  z.object({ t: z.literal('layout.rename'), name: Name }),
]);
export type Op = z.infer<typeof Op>;

export interface Layout {
  name: string;
  kind: LayoutKind;
}

/** One document per layout; `null` until `layout.create` is applied. */
export type LayoutDoc = Layout | null;

/** A domain precondition failed. Maps to the `conflict` rejection code. */
export class OpError extends Error {
  readonly code = 'conflict' as const;
  constructor(message: string) {
    super(message);
    this.name = 'OpError';
  }
}

/** Pure reducer shared by app and server. Throws OpError on a failed precondition. */
export function applyOp(doc: LayoutDoc, op: Op): LayoutDoc {
  switch (op.t) {
    case 'layout.create':
      if (doc) throw new OpError('Layout already exists');
      return { name: op.name, kind: op.kind };
    case 'layout.rename':
      if (!doc) throw new OpError('Layout does not exist yet');
      return { ...doc, name: op.name };
  }
}
