import { describe, expect, it } from 'vitest';
import { layoutSummary } from './measure';
import type { Comment, Layout } from './model';
import { OpError, Op as OpSchema, applyOp, applyWithInverse, type BaseOp } from './ops';
import { canSend } from './protocol';
import { room12x10 } from './test-helpers';

const room = () => room12x10() as Layout;
const comment = (over: Partial<Comment> = {}): Comment => ({
  id: 'c1',
  target: { kind: 'wall', wallId: 'w1' },
  tag: 'verify',
  by: 'office',
  at: 0,
  resolved: false,
  ...over,
});
const add = (c: Comment): BaseOp => ({ t: 'comment.add', comment: c });

describe('comments', () => {
  it('add, resolve and both undos restore the layout exactly', () => {
    const doc = room();
    const added = applyWithInverse(doc, add(comment()));
    expect(applyOp(added.doc, added.inverse)).toEqual(doc);
    const resolved = applyWithInverse(added.doc, { t: 'comment.resolve', id: 'c1', resolved: true });
    expect(resolved.doc!.comments!.c1!.resolved).toBe(true);
    expect(applyOp(resolved.doc, resolved.inverse)).toEqual(added.doc);
  });

  it('can be pinned to the closing wall or the whole space, not to something deleted', () => {
    expect(() => applyOp(room(), add(comment({ target: { kind: 'wall', wallId: 'wc' } })))).not.toThrow();
    expect(() => applyOp(room(), add(comment({ target: null })))).not.toThrow();
    expect(() => applyOp(room(), add(comment({ target: { kind: 'feature', featureId: 'ghost' } })))).toThrow(OpError);
  });

  it('needs a tag or some text', () => {
    expect(OpSchema.safeParse(add(comment({ tag: undefined, text: undefined }))).success).toBe(false);
    expect(OpSchema.safeParse(add(comment({ tag: undefined, text: 'Rotten joist' }))).success).toBe(true);
  });

  it('open comments count against "ready to quote"', () => {
    let doc = applyOp(room(), add(comment())) as Layout;
    expect(layoutSummary(doc).openComments).toBe(1);
    doc = applyOp(doc, { t: 'comment.resolve', id: 'c1', resolved: true }) as Layout;
    expect(layoutSummary(doc).openComments).toBe(0);
  });
});

describe('who may send what', () => {
  it('office may comment and resolve, but never change geometry', () => {
    expect(canSend('office', add(comment({ by: 'office' })))).toBe(true);
    expect(canSend('office', { t: 'comment.resolve', id: 'c1', resolved: true })).toBe(true);
    expect(canSend('office', { t: 'wall.remove', id: 'w1' })).toBe(false);
    expect(canSend('office', { t: 'batch', ops: [add(comment()), { t: 'wall.remove', id: 'w1' }] })).toBe(false);
  });

  it('nobody may comment in the other role’s name', () => {
    expect(canSend('office', add(comment({ by: 'field' })))).toBe(false);
    expect(canSend('field', add(comment({ by: 'office' })))).toBe(false);
    expect(canSend('field', add(comment({ by: 'field' })))).toBe(true);
  });
});
