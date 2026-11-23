import { describe, expect, it } from 'vitest';
import type { ServerMsg } from '@field-form/shared';
import { Hub } from './hub';
import { openSqliteStore } from './store';

function client(hub: Hub) {
  const inbox: ServerMsg[] = [];
  const session = hub.connect((m) => inbox.push(m));
  return {
    inbox,
    send: (msg: unknown) => session.receive(JSON.stringify(msg)),
    close: () => session.close(),
  };
}

const hello = (role: 'field' | 'office', lastSeq = 0, clientId = role) =>
  ({ type: 'hello', layoutId: 'L1', clientId, role, lastSeq }) as const;
const create = { t: 'layout.create', name: 'Kitchen', kind: 'room' } as const;

describe('Hub contract', () => {
  it('broadcasts one commit to every subscriber, author included', () => {
    const hub = new Hub(openSqliteStore(':memory:'));
    const dana = client(hub);
    const marcus = client(hub);
    dana.send(hello('field'));
    marcus.send(hello('office'));
    dana.send({ type: 'submit', opId: 'op1', op: create });
    const commitFor = (c: ReturnType<typeof client>) => c.inbox.find((m) => m.type === 'commit');
    expect(commitFor(dana)).toMatchObject({ seq: 1, opId: 'op1', clientId: 'field' });
    expect(commitFor(marcus)).toMatchObject({ seq: 1, opId: 'op1' });
  });

  it('a duplicate opId returns the original commit and is not applied twice', () => {
    const hub = new Hub(openSqliteStore(':memory:'));
    const dana = client(hub);
    dana.send(hello('field'));
    dana.send({ type: 'submit', opId: 'op1', op: create });
    dana.send({ type: 'submit', opId: 'op1', op: create });
    const commits = dana.inbox.filter((m) => m.type === 'commit');
    expect(commits).toHaveLength(2);
    expect(commits.every((c) => c.type === 'commit' && c.seq === 1)).toBe(true);
    expect(dana.inbox.some((m) => m.type === 'reject')).toBe(false);
  });

  it('replays missed commits on reconnect, then sends ready', () => {
    const store = openSqliteStore(':memory:');
    const hub = new Hub(store);
    const dana = client(hub);
    dana.send(hello('field'));
    dana.send({ type: 'submit', opId: 'op1', op: create });
    dana.send({ type: 'submit', opId: 'op2', op: { t: 'layout.rename', name: 'Deck' } });

    const late = client(new Hub(store)); // fresh process, same database
    late.send(hello('office', 1));
    expect(late.inbox.map((m) => m.type)).toEqual(['commit', 'ready']);
    expect(late.inbox[0]).toMatchObject({ seq: 2, opId: 'op2' });
    expect(late.inbox[1]).toMatchObject({ headSeq: 2 });
  });

  it('rejects with invalid / forbidden / conflict and never commits', () => {
    const hub = new Hub(openSqliteStore(':memory:'));
    const marcus = client(hub);
    marcus.send(hello('office'));
    marcus.send({ type: 'submit', opId: 'bad', op: { t: 'layout.create', name: '' } });
    marcus.send({ type: 'submit', opId: 'nope', op: create });

    const dana = client(hub);
    dana.send(hello('field'));
    dana.send({ type: 'submit', opId: 'r1', op: { t: 'layout.rename', name: 'X' } });

    const codes = [...marcus.inbox, ...dana.inbox]
      .filter((m) => m.type === 'reject')
      .map((m) => m.type === 'reject' && m.code);
    expect(codes).toEqual(['invalid', 'forbidden', 'conflict']);
    expect([...marcus.inbox, ...dana.inbox].some((m) => m.type === 'commit')).toBe(false);
  });
});
