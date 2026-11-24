import { describe, expect, it } from 'vitest';
import { closure } from './geometry';
import type { CommentTarget, Layout } from './model';
import { OpError, applyOp, applyWithInverse, type Op } from './ops';
import { door, room12x10, run, wall } from './test-helpers';
import { feet, inches } from './units';

const layout = (): Layout => room12x10()!;

/** Applying an op and then its inverse must restore the document exactly. */
function expectInverseRestores(doc: Layout, op: Op) {
  const { doc: after, inverse } = applyWithInverse(doc, op);
  expect(after).not.toEqual(doc);
  expect(applyOp(after, inverse)).toEqual(doc);
}

describe('reducer: every op inverts', () => {
  const withDoor = () => run([{ t: 'feature.add', feature: door('d1', 'w1', feet(2), inches(36)) }], layout())!;

  it.each<[string, () => Layout, Op]>([
    ['rename', layout, { t: 'layout.rename', name: 'Pantry' }],
    ['archive (soft delete)', layout, { t: 'layout.archive', archived: true }],
    ['wall.add', layout, { t: 'wall.add', wall: wall('w9', 45, feet(3)), index: 1 }],
    ['wall.update', layout, { t: 'wall.update', id: 'w2', patch: { turnDeg: 45 } }],
    ['wall.remove', withDoor, { t: 'wall.remove', id: 'w1' }],
    ['outline.open', layout, { t: 'outline.open' }],
    ['feature.add', layout, { t: 'feature.add', feature: door('d2', 'w2', 0, inches(30)) }],
    ['feature.remove', withDoor, { t: 'feature.remove', id: 'd1' }],
    [
      'dimension.set wall',
      layout,
      { t: 'dimension.set', target: { kind: 'wall', wallId: 'w1' }, dim: { value: feet(12) + 3 } },
    ],
    ['dimension.set closing', layout, { t: 'dimension.set', target: { kind: 'closing' }, dim: { value: feet(10) } }],
    [
      'dimension.set feature',
      withDoor,
      { t: 'dimension.set', target: { kind: 'feature', featureId: 'd1', field: 'width' }, dim: { value: inches(36) } },
    ],
    [
      'batch',
      layout,
      {
        t: 'batch',
        ops: [
          { t: 'layout.rename', name: 'A' },
          { t: 'wall.remove', id: 'w3' },
        ],
      },
    ],
  ])('%s', (_, make, op) => expectInverseRestores(make(), op));
});

describe('reducer: structural rules', () => {
  it('delete + undo restores the wall at its index with all attached features', () => {
    const doc = run(
      [
        { t: 'feature.add', feature: door('d1', 'w2', feet(1), inches(36)) },
        { t: 'feature.add', feature: { ...door('win', 'w2', feet(5), inches(48)), kind: 'window' } as never },
        { t: 'feature.add', feature: door('d3', 'w1', feet(1), inches(30)) },
      ],
      layout(),
    )!;
    const { doc: removed, inverse } = applyWithInverse(doc, { t: 'wall.remove', id: 'w2' });
    expect(removed!.outline.walls.map((w) => w.id)).toEqual(['w1', 'w3']);
    expect(Object.keys(removed!.features)).toEqual(['d3']);
    const restored = applyOp(removed, inverse)!;
    expect(restored.outline.walls.map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
    expect(Object.keys(restored.features).sort()).toEqual(['d1', 'd3', 'win']);
  });

  it('a door can attach to the closing wall and survives re-measuring other walls', () => {
    const doc = run(
      [
        { t: 'feature.add', feature: door('d1', 'wc', feet(2), inches(36)) },
        { t: 'dimension.set', target: { kind: 'wall', wallId: 'w1' }, dim: { value: feet(13), source: 'tape' } },
      ],
      layout(),
    )!;
    expect(doc.features.d1).toBeDefined();
  });

  it('re-opening removes closing-wall features and undo brings them back', () => {
    const doc = run([{ t: 'feature.add', feature: door('d1', 'wc', feet(2), inches(36)) }], layout())!;
    const { doc: opened, inverse } = applyWithInverse(doc, { t: 'outline.open' });
    expect(opened!.features.d1).toBeUndefined();
    expect(applyOp(opened, inverse)).toEqual(doc);
  });

  it('comments go with the wall or feature they are pinned to, and undo brings them back', () => {
    const comment = (id: string, target: CommentTarget) =>
      ({ t: 'comment.add', comment: { id, target, tag: 'verify', by: 'office', at: 0, resolved: false } }) as const;
    const doc = run(
      [
        { t: 'feature.add', feature: door('d1', 'w1', feet(2), inches(36)) },
        comment('onDoor', { kind: 'feature', featureId: 'd1' }),
        comment('onWall', { kind: 'wall', wallId: 'w1' }),
        comment('onSpace', null),
      ],
      layout(),
    )!;

    const { doc: noDoor, inverse: undoDoor } = applyWithInverse(doc, { t: 'feature.remove', id: 'd1' });
    expect(Object.keys(noDoor!.comments!)).toEqual(['onWall', 'onSpace']);
    expect(applyOp(noDoor, undoDoor)).toEqual(doc);

    const { doc: noWall, inverse: undoWall } = applyWithInverse(doc, { t: 'wall.remove', id: 'w1' });
    expect(Object.keys(noWall!.comments!)).toEqual(['onSpace']);
    expect(applyOp(noWall, undoWall)).toEqual(doc);
  });

  it('closure error is measured − computed, and no measured value is changed', () => {
    const doc = run(
      [
        { t: 'dimension.set', target: { kind: 'wall', wallId: 'w1' }, dim: { value: feet(12), source: 'tape' } },
        { t: 'dimension.set', target: { kind: 'closing' }, dim: { value: feet(10) + inches(0.5), source: 'tape' } },
      ],
      layout(),
    )!;
    const c = closure(doc.outline)!;
    expect(c.computed).toBe(feet(10));
    expect(c.error).toBe(inches(0.5));
    expect(doc.outline.walls[0]!.length.value).toBe(feet(12));
    expect(doc.outline.closingLength.value).toBe(feet(10) + inches(0.5));
  });

  it('a batch whose last op fails leaves the layout unchanged', () => {
    const doc = layout();
    const before = structuredClone(doc);
    expect(() =>
      applyOp(doc, {
        t: 'batch',
        ops: [
          { t: 'layout.rename', name: 'X' },
          { t: 'wall.remove', id: 'nope' },
        ],
      }),
    ).toThrow(OpError);
    expect(doc).toEqual(before);
  });

  it.each<[string, Op]>([
    ['duplicate wall id', { t: 'wall.add', wall: wall('w1', 0, feet(1)) }],
    ['wall id clashing with the closing wall', { t: 'wall.add', wall: wall('wc', 0, feet(1)) }],
    ['feature on a missing wall', { t: 'feature.add', feature: door('d1', 'ghost', 0, inches(30)) }],
    ['unknown feature field', { t: 'feature.add', feature: door('d1', 'w1', 0, inches(30)) }],
    ['closing an already closed outline', { t: 'outline.close', closingWallId: 'x' }],
  ])('rejects %s', (name, op) => {
    const doc = name === 'unknown feature field' ? applyOp(layout(), op) : layout();
    const bad: Op =
      name === 'unknown feature field'
        ? { t: 'dimension.set', target: { kind: 'feature', featureId: 'd1', field: 'sill' }, dim: { value: 1 } }
        : op;
    expect(() => applyOp(doc, bad)).toThrow(OpError);
  });
});
