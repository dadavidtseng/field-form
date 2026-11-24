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

const hello = (role: 'field' | 'office', lastSeq = 0, clientId: string = role) =>
  ({ type: 'hello', layoutId: 'L1', clientId, role, lastSeq }) as const;
const create = { t: 'layout.create', name: 'Kitchen', kind: 'room' } as const;

describe('Hub layout index', () => {
  it('lists created layouts and tracks whether a field device has them open', () => {
    const hub = new Hub(openSqliteStore(':memory:'));
    const marcus = client(hub);
    marcus.send({ type: 'watchIndex', clientId: 'm', role: 'office' });
    const lastIndex = () => {
      const msgs = marcus.inbox.filter((m) => m.type === 'index');
      const last = msgs[msgs.length - 1];
      return last?.type === 'index' ? last.layouts : [];
    };
    expect(lastIndex()).toEqual([]);

    const dana = client(hub);
    dana.send(hello('field'));
    dana.send({ type: 'submit', opId: 'op1', op: create });
    expect(lastIndex()).toMatchObject([{ id: 'L1', name: 'Kitchen', kind: 'room', live: true, walls: 0 }]);

    // A closed 3-wall sketch is a 4-wall shape: the closing wall counts too.
    const wall = (id: string, turnDeg: number) => ({ id, turnDeg, length: { value: null }, sketchUm: 1_000_000 });
    dana.send({
      type: 'submit',
      opId: 'op2',
      op: {
        t: 'batch',
        ops: [
          { t: 'wall.add', wall: wall('a', 0) },
          { t: 'wall.add', wall: wall('b', 90) },
          { t: 'wall.add', wall: wall('c', 90) },
          { t: 'outline.close', closingWallId: 'd' },
        ],
      },
    });
    expect(lastIndex()).toMatchObject([{ id: 'L1', walls: 4, closed: true }]);

    dana.close();
    expect(lastIndex()).toMatchObject([{ id: 'L1', live: false }]);
  });

  it('a deleted layout leaves the list, and comes back when the delete is undone', () => {
    const hub = new Hub(openSqliteStore(':memory:'));
    const marcus = client(hub);
    marcus.send({ type: 'watchIndex', clientId: 'm', role: 'office' });
    const ids = () => {
      const msgs = marcus.inbox.filter((m) => m.type === 'index');
      const last = msgs[msgs.length - 1];
      return last?.type === 'index' ? last.layouts.map((l) => l.id) : [];
    };
    const dana = client(hub);
    dana.send(hello('field'));
    dana.send({ type: 'submit', opId: 'op1', op: create });
    dana.send({ type: 'submit', opId: 'op2', op: { t: 'layout.archive', archived: true } });
    expect(ids()).toEqual([]);
    dana.send({ type: 'submit', opId: 'op3', op: { t: 'layout.archive', archived: false } });
    expect(ids()).toEqual(['L1']);
  });
});

describe('Hub presence (many-to-many)', () => {
  it('two field devices and an office all see the counts, and every commit', () => {
    const hub = new Hub(openSqliteStore(':memory:'));
    const dana = client(hub);
    const sam = client(hub);
    const marcus = client(hub);
    dana.send(hello('field', 0, 'dana'));
    sam.send(hello('field', 0, 'sam'));
    marcus.send(hello('office', 0, 'marcus'));
    const lastPresence = (c: ReturnType<typeof client>) => {
      const p = c.inbox.filter((m) => m.type === 'presence');
      return p[p.length - 1];
    };
    for (const c of [dana, sam, marcus]) expect(lastPresence(c)).toMatchObject({ field: 2, office: 1 });

    dana.send({ type: 'submit', opId: 'op1', op: create });
    for (const c of [dana, sam, marcus])
      expect(c.inbox.some((m) => m.type === 'commit' && m.opId === 'op1')).toBe(true);

    marcus.close();
    expect(lastPresence(dana)).toMatchObject({ field: 2, office: 0 });
    expect(lastPresence(sam)).toMatchObject({ field: 2, office: 0 });
  });
});

describe('Hub presence counts devices', () => {
  it('one device with two connections counts once, and still counts after one closes', () => {
    const hub = new Hub(openSqliteStore(':memory:'));
    const dana = client(hub);
    const marcusA = client(hub);
    const marcusB = client(hub); // same device, a second screen for the same space
    dana.send(hello('field', 0, 'dana'));
    marcusA.send(hello('office', 0, 'marcus'));
    marcusB.send(hello('office', 0, 'marcus'));
    const last = () => dana.inbox.filter((m) => m.type === 'presence').at(-1);
    expect(last()).toMatchObject({ field: 1, office: 1 });
    marcusB.close();
    expect(last()).toMatchObject({ field: 1, office: 1 });
    marcusA.close();
    expect(last()).toMatchObject({ field: 1, office: 0 });
  });
});

describe('Hub comments', () => {
  it("the office's comment commits and reaches the field; its geometry edit does not", () => {
    const hub = new Hub(openSqliteStore(':memory:'));
    const dana = client(hub);
    const marcus = client(hub);
    dana.send(hello('field'));
    marcus.send(hello('office'));
    dana.send({ type: 'submit', opId: 'op1', op: create });
    marcus.send({
      type: 'submit',
      opId: 'c1',
      op: {
        t: 'comment.add',
        comment: { id: 'c1', target: null, tag: 'verify', by: 'office', at: 0, resolved: false },
      },
    });
    marcus.send({ type: 'submit', opId: 'r1', op: { t: 'layout.rename', name: 'Hack' } });

    expect(dana.inbox.some((m) => m.type === 'commit' && m.op.t === 'comment.add')).toBe(true);
    expect(marcus.inbox.find((m) => m.type === 'reject')).toMatchObject({ opId: 'r1', code: 'forbidden' });
  });
});

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
    expect(late.inbox.map((m) => m.type)).toEqual(['commit', 'ready', 'presence']);
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
