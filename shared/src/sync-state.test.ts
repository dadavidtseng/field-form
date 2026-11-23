import { describe, expect, it } from 'vitest';
import { applyOp, type LayoutDoc, type Op } from './ops';
import {
  SyncGapError,
  initialState,
  receiveCommit,
  receiveReject,
  submitLocal,
  type SyncState,
} from './sync-state';

const create: Op = { t: 'layout.create', name: 'Kitchen', kind: 'room' };
const rename: Op = { t: 'layout.rename', name: 'Kitchen 2' };
const start = (): SyncState<LayoutDoc, Op> => initialState<LayoutDoc, Op>(null);

describe('sync state machine', () => {
  it('shows a local op immediately and keeps it pending', () => {
    const s = submitLocal(start(), { opId: 'a', op: create }, applyOp);
    expect(s.view).toEqual({ name: 'Kitchen', kind: 'room' });
    expect(s.confirmed).toBeNull();
    expect(s.pending).toHaveLength(1);
  });

  it('own commit clears the pending entry (the commit is the ack)', () => {
    let s = submitLocal(start(), { opId: 'a', op: create }, applyOp);
    s = receiveCommit(s, { seq: 1, opId: 'a', op: create }, applyOp).state;
    expect(s.pending).toHaveLength(0);
    expect(s.confirmed).toEqual(s.view);
    expect(s.lastSeq).toBe(1);
  });

  it('lost ack: a replayed commit after reconnect applies exactly once', () => {
    let s = submitLocal(start(), { opId: 'a', op: create }, applyOp);
    s = submitLocal(s, { opId: 'b', op: rename }, applyOp);
    // Connection dropped before either commit arrived; replay delivers them.
    s = receiveCommit(s, { seq: 1, opId: 'a', op: create }, applyOp).state;
    s = receiveCommit(s, { seq: 2, opId: 'b', op: rename }, applyOp).state;
    // A duplicate delivery of seq 2 (e.g. resubmit echo) is ignored.
    s = receiveCommit(s, { seq: 2, opId: 'b', op: rename }, applyOp).state;
    expect(s.pending).toHaveLength(0);
    expect(s.view).toEqual({ name: 'Kitchen 2', kind: 'room' });
    expect(s.lastSeq).toBe(2);
  });

  it('remote commit is applied under our pending ops (rebase)', () => {
    let s = receiveCommit(start(), { seq: 1, opId: 'x', op: create }, applyOp).state;
    s = submitLocal(s, { opId: 'a', op: rename }, applyOp);
    s = receiveCommit(s, { seq: 2, opId: 'y', op: { t: 'layout.rename', name: 'Remote' } }, applyOp).state;
    expect(s.confirmed?.name).toBe('Remote');
    expect(s.view?.name).toBe('Kitchen 2'); // our pending rename still on top
  });

  it('a rejected op also drops pending ops that depended on it, with reasons', () => {
    let s = submitLocal(start(), { opId: 'a', op: create }, applyOp);
    s = submitLocal(s, { opId: 'b', op: rename }, applyOp);
    const t = receiveReject(s, { opId: 'a', message: 'forbidden' }, applyOp);
    expect(t.state.pending).toHaveLength(0);
    expect(t.state.view).toBeNull();
    expect(t.dropped.map((d) => d.opId)).toEqual(['a', 'b']);
    expect(t.dropped[1]?.reason).toMatch(/does not exist/);
  });

  it('a gap in seq forces a resync instead of silently diverging', () => {
    expect(() => receiveCommit(start(), { seq: 2, opId: 'a', op: create }, applyOp)).toThrow(SyncGapError);
  });
});
