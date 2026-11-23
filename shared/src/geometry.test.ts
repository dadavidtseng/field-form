import { describe, expect, it } from 'vitest';
import {
  SQ_UM_PER_SQ_FT,
  area,
  closure,
  corners,
  featureFits,
  perimeter,
  postPosition,
  wallFeatureSpan,
} from './geometry';
import type { Feature, Layout } from './model';
import { applyOp } from './ops';
import { snapCorner, wallsFromCorners } from './sketch';
import { door, room12x10, run, wall } from './test-helpers';
import { feet, inches } from './units';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(2); // µm

describe('geometry', () => {
  it('rectangle: corners, perimeter, area, zero closure', () => {
    const { outline } = room12x10()!;
    const pts = corners(outline);
    near(pts[2]!.x, feet(12));
    near(pts[2]!.y, feet(10));
    near(pts[3]!.x, 0);
    expect(perimeter(outline)).toBe(feet(44));
    near(area(outline)! / SQ_UM_PER_SQ_FT, 120);
    expect(closure(outline)!.computed).toBe(feet(10));
  });

  it('L-shape area', () => {
    // 10×10 square with a 5×5 notch: 75 sq ft.
    const doc = run([
      { t: 'layout.create', name: 'L', kind: 'deck' },
      { t: 'wall.add', wall: wall('a', 0, feet(10)) },
      { t: 'wall.add', wall: wall('b', 90, feet(5)) },
      { t: 'wall.add', wall: wall('c', 90, feet(5)) },
      { t: 'wall.add', wall: wall('d', -90, feet(5)) },
      { t: 'wall.add', wall: wall('e', 90, feet(5)) },
      { t: 'outline.close', closingWallId: 'f' },
    ])!;
    near(area(doc.outline)! / SQ_UM_PER_SQ_FT, 75);
    expect(closure(doc.outline)!.computed).toBe(feet(10));
  });

  it('45° bay closes back to the start', () => {
    const d = feet(2) * Math.SQRT2;
    const doc = run([
      { t: 'layout.create', name: 'Bay', kind: 'room' },
      { t: 'wall.add', wall: wall('a', 0, feet(4)) },
      { t: 'wall.add', wall: wall('b', 45, Math.round(d)) },
      { t: 'wall.add', wall: wall('c', 45, feet(2)) },
      { t: 'wall.add', wall: wall('e', 45, Math.round(d)) },
      { t: 'wall.add', wall: wall('f', 45, feet(4)) },
      { t: 'outline.close', closingWallId: 'h' }, // from (0, 6') back to the origin
    ])!;
    near(closure(doc.outline)!.computed, feet(6));
  });

  it('measuring a wall moves every later corner (sketch → real length)', () => {
    const before = corners(room12x10()!.outline);
    const after = corners(
      applyOp(room12x10(), { t: 'dimension.set', target: { kind: 'wall', wallId: 'w1' }, dim: { value: feet(13) } })!
        .outline,
    );
    near(after[1]!.x - before[1]!.x, feet(1));
    near(after[2]!.x - before[2]!.x, feet(1));
    near(after[0]!.x, before[0]!.x);
  });

  it('door span sits on its wall; a door longer than the wall is flagged', () => {
    const doc = room12x10() as Layout;
    const ok = door('d', 'w1', feet(2), inches(36));
    const span = wallFeatureSpan(doc, ok as Extract<Feature, { kind: 'door' }>)!;
    near(span.a.x, feet(2));
    near(span.b.x, feet(5));
    expect(featureFits(doc, ok)).toBe(true);
    expect(featureFits(doc, door('big', 'w2', feet(9), feet(2)))).toBe(false);
  });

  it('post offsets are measured from its corner along and out from the wall', () => {
    const doc = room12x10() as Layout;
    const post: Extract<Feature, { kind: 'post' }> = {
      id: 'p',
      kind: 'post',
      cornerWallId: 'w2', // corner at (12', 0), w2 heads up
      dx: { value: feet(4) },
      dy: { value: feet(1) },
      sketch: { dx: feet(3), dy: feet(1) }, // tapped to the left of w2 = inside the room
    };
    const p = postPosition(doc, post)!;
    near(p.x, feet(11));
    near(p.y, feet(4));
  });
});

describe('sketch snapping', () => {
  it('wobbly taps become a square, closed rectangle', () => {
    const taps = [
      { x: 0, y: 0 },
      { x: feet(12) + inches(2), y: inches(3) },
      { x: feet(12) - inches(1), y: feet(10) + inches(2) },
      { x: inches(2), y: feet(10) - inches(1) },
    ];
    let n = 0;
    const walls = wallsFromCorners(taps, () => `w${++n}`);
    expect(walls.map((w) => w.turnDeg)).toEqual([0, 90, 90]);
    expect(walls.map((w) => w.sketchUm)).toEqual([feet(12), feet(10), feet(12)]);
    expect(walls.every((w) => w.length.value === null)).toBe(true);
  });

  it('snapCorner previews the same snapped point', () => {
    const p = snapCorner({ x: 0, y: 0 }, { x: feet(5) + inches(2), y: inches(4) });
    near(p.x, feet(5));
    near(p.y, 0);
  });
});
