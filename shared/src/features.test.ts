import { describe, expect, it } from 'vitest';
import { placePost, placeWallFeature, featureNames } from './features';
import { featureFits, measureGuide, postPosition, wallFeatureSpan } from './geometry';
import { measureSlots, nextUnmeasured, requiredProgress } from './measure';
import type { Feature, Layout } from './model';
import { applyOp } from './ops';
import { room12x10 } from './test-helpers';
import { feet, inches } from './units';

const room = () => room12x10() as Layout;
const add = (doc: Layout, f: Feature | null) => applyOp(doc, { t: 'feature.add', feature: f! }) as Layout;
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(2);

describe('placing features', () => {
  it('a door is centred on the tap and drawn at its default width', () => {
    const door = placeWallFeature(room(), 'w1', 'door', 'd1', { x: feet(6), y: inches(1) })!;
    expect(door.sketch).toEqual({ offset: feet(6) - inches(18), width: inches(36) });
  });

  it('a door tapped at the very end of a wall stays on the wall', () => {
    const door = placeWallFeature(room(), 'w1', 'door', 'd1', { x: feet(12), y: 0 })!;
    expect(door.sketch.offset + door.sketch.width).toBeLessThanOrEqual(feet(12));
    expect(featureFits(add(room(), door), door)).toBe(true);
  });

  it('a window can go on the closing wall, mid-wall by default', () => {
    const win = placeWallFeature(room(), 'wc', 'window', 'win', undefined)!;
    const doc = add(room(), win);
    const span = wallFeatureSpan(doc, win)!;
    near(span.a.y, feet(7)); // closing wall runs from (0,10') down to the origin
    near(span.b.y, feet(3));
  });

  it('a post is anchored to the nearest corner it is in front of, inside the room', () => {
    const tap = { x: feet(11), y: feet(3) };
    const post = placePost(room(), tap, 'p1')!;
    expect(post.kind).toBe('post');
    const doc = add(room(), post);
    const at = postPosition(doc, post as Extract<Feature, { kind: 'post' }>)!;
    near(at.x, tap.x);
    near(at.y, tap.y);
  });

  it('features are numbered per kind', () => {
    let doc = add(room(), placeWallFeature(room(), 'w1', 'door', 'a'));
    doc = add(doc, placeWallFeature(doc, 'w2', 'window', 'b'));
    doc = add(doc, placeWallFeature(doc, 'w3', 'door', 'c'));
    expect(featureNames(doc)).toEqual({ a: 'Door 1', b: 'Window 1', c: 'Door 2' });
  });
});

describe('measuring from the nearer corner', () => {
  it('a door near the end of a wall is measured from that end', () => {
    const door = placeWallFeature(room(), 'w1', 'door', 'd1', { x: feet(10), y: 0 })!;
    expect(door.from).toBe('end');
    let doc = add(room(), door);
    doc = applyOp(doc, {
      t: 'dimension.set',
      target: { kind: 'feature', featureId: 'd1', field: 'offset' },
      dim: { value: feet(1) },
    }) as Layout;
    const span = wallFeatureSpan(doc, doc.features.d1 as Exclude<Feature, { kind: 'post' }>)!;
    near(span.b.x, feet(11)); // 1' in from the far corner at 12'
  });

  it('the guide for a door offset runs from its corner to the door edge, off the wall', () => {
    const doc = add(room(), placeWallFeature(room(), 'w1', 'door', 'd1', { x: feet(10), y: 0 }));
    const g = measureGuide(doc, { kind: 'feature', featureId: 'd1', field: 'offset' })!;
    near(g.corner.x, feet(12));
    near(g.a.x, feet(12));
    near(g.b.x, feet(12) - (doc.features.d1 as { sketch: { offset: number } }).sketch.offset);
    expect(g.normal.y).toBeLessThan(0); // pushed outside the room (below the bottom wall)
  });

  it('the guide for a post runs along the wall, then out to the post', () => {
    const doc = add(room(), placePost(room(), { x: feet(11), y: feet(3) }, 'p1'));
    const along = measureGuide(doc, { kind: 'feature', featureId: 'p1', field: 'dx' })!;
    const out = measureGuide(doc, { kind: 'feature', featureId: 'p1', field: 'dy' })!;
    near(along.b.x, out.a.x);
    near(along.b.y, out.a.y);
    near(out.b.x, feet(11));
    near(out.b.y, feet(3));
  });
});

describe('measuring features', () => {
  it('feature slots follow the walls: offset then width, along then out', () => {
    let doc = add(room(), placeWallFeature(room(), 'w1', 'door', 'd1'));
    doc = add(doc, placePost(doc, { x: feet(11), y: feet(3) }, 'p1'));
    const labels = measureSlots(doc).map((s) => s.label);
    expect(labels.slice(4)).toEqual([
      'Door 1 · width',
      'Door 1 · from the yellow corner',
      'Door 1 · height',
      'Post 1 · along the wall from the yellow corner',
      'Post 1 · out from that wall',
      'Post 1 · size',
    ]);
  });

  it('optional extras are never auto-armed and never count toward "ready to quote"', () => {
    let doc = add(room(), placeWallFeature(room(), 'w1', 'door', 'd1'));
    const measureField = (field: string) =>
      (doc = applyOp(doc, {
        t: 'dimension.set',
        target: { kind: 'feature', featureId: 'd1', field },
        dim: { value: inches(36) },
      }) as Layout);
    measureField('width');
    measureField('offset');
    const slots = measureSlots(doc);
    expect(nextUnmeasured(slots, 'feature:d1:offset')?.key).not.toBe('feature:d1:height');
    expect(requiredProgress(slots)).toEqual({ measured: 2, total: 6 }); // 4 walls + door width/offset
  });

  it('post size is a detail measurement (calipers), the others are not', () => {
    const doc = add(room(), placePost(room(), { x: feet(11), y: feet(3) }, 'p1'));
    const detail = measureSlots(doc)
      .filter((s) => s.detail)
      .map((s) => s.label);
    expect(detail).toEqual(['Post 1 · size']);
  });

  it('after the last wall, auto-advance moves on to the first feature', () => {
    const doc = add(room(), placeWallFeature(room(), 'w1', 'door', 'd1'));
    expect(nextUnmeasured(measureSlots(doc), 'closing')!.key).toBe('feature:d1:width');
  });

  it('measuring a door moves it to its real position', () => {
    let doc = add(room(), placeWallFeature(room(), 'w1', 'door', 'd1'));
    doc = applyOp(doc, {
      t: 'dimension.set',
      target: { kind: 'feature', featureId: 'd1', field: 'offset' },
      dim: { value: feet(1) },
    }) as Layout;
    const span = wallFeatureSpan(doc, doc.features.d1 as Exclude<Feature, { kind: 'post' }>)!;
    near(span.a.x, feet(1));
  });
});
