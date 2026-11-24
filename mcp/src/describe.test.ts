import { describe, expect, it } from 'vitest';
import { applyOp, feet, type Layout, type LayoutSummary, type Op } from '@field-form/shared';
import { describeSpace, findSpace, resolveTarget } from './describe';

const kitchen = (): Layout =>
  (
    [
      { t: 'layout.create', name: 'Kitchen', kind: 'room' },
      {
        t: 'wall.add',
        wall: { id: 'w1', turnDeg: 0, sketchUm: feet(12), length: { value: feet(12), source: 'tape' } },
      },
      { t: 'wall.add', wall: { id: 'w2', turnDeg: 90, sketchUm: feet(10), length: { value: null } } },
      { t: 'wall.add', wall: { id: 'w3', turnDeg: 90, sketchUm: feet(12), length: { value: null } } },
      { t: 'outline.close', closingWallId: 'wc' },
      {
        t: 'feature.add',
        feature: {
          id: 'd1',
          kind: 'door',
          wallId: 'w1',
          offset: { value: null },
          width: { value: null },
          sketch: { offset: feet(4), width: feet(3) },
        },
      },
    ] satisfies Op[]
  ).reduce(applyOp, null) as Layout;

const summary = (id: string, name: string): LayoutSummary => ({
  id,
  name,
  kind: 'room',
  updatedAt: 0,
  walls: 4,
  closed: true,
  live: false,
});

describe('findSpace', () => {
  const spaces = [summary('a1', 'Kitchen'), summary('b2', 'Back deck'), summary('c3', 'Front deck')];

  it('matches an id exactly, or a unique part of a name in any case', () => {
    expect(findSpace(spaces, 'b2').name).toBe('Back deck');
    expect(findSpace(spaces, 'KITCH').id).toBe('a1');
  });

  it('refuses to guess between two matches, and says when nothing matches', () => {
    expect(() => findSpace(spaces, 'deck')).toThrow(/matches 2 spaces/);
    expect(() => findSpace(spaces, 'garage')).toThrow(/No space matches/);
  });
});

describe('describeSpace', () => {
  it('names walls the way add_comment accepts them and separates measured from sketched', () => {
    const d = describeSpace(kitchen());
    expect(d.walls.map((w) => w.name)).toEqual(['Wall 1', 'Wall 2', 'Wall 3', 'Last wall']);
    expect(d.walls[0]).toMatchObject({ value: `12' 0"`, source: 'tape' });
    expect(d.walls[1]).toMatchObject({ value: null, sketchEstimate: `10' 0"` });
    expect(d.features[0]).toMatchObject({ name: 'Door 1', onWall: 'Wall 1' });
    expect(d.stillToMeasure).toEqual([
      'Wall 2',
      'Wall 3',
      'Last wall',
      'Door 1 width',
      'Door 1 offset from the wall corner',
    ]);
    expect(d.readyToQuote).toBe(false);
  });
});

describe('resolveTarget', () => {
  it('accepts the names get_space prints, ids, or nothing for the whole space', () => {
    const k = kitchen();
    expect(resolveTarget(k, undefined)).toBeNull();
    expect(resolveTarget(k, 'Wall 2')).toEqual({ kind: 'wall', wallId: 'w2' });
    expect(resolveTarget(k, 'last wall')).toEqual({ kind: 'wall', wallId: 'wc' });
    expect(resolveTarget(k, 'door 1')).toEqual({ kind: 'feature', featureId: 'd1' });
    expect(resolveTarget(k, 'w3')).toEqual({ kind: 'wall', wallId: 'w3' });
    expect(() => resolveTarget(k, 'Window 1')).toThrow(/No wall or feature/);
  });
});
