import { segmentFor, segments, type Pt, type Segment } from './geometry';
import { EMPTY, type Feature, type Layout, type WallFeature } from './model';
import { inches, type Um } from './units';

// Placing features from a single tap. The tap only sets a sketch position; the real offset
// and width come from measurements, exactly like sketched walls.

export type WallFeatureKind = WallFeature['kind'];

/** Typical sizes, so a new feature is drawn plausibly before it is measured. */
const DEFAULT_WIDTH: Record<WallFeatureKind, Um> = {
  door: inches(36),
  window: inches(48),
  opening: inches(36),
  step: inches(48),
};

const SNAP = inches(1);
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

function frame(s: Segment) {
  const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1;
  const ux = (s.b.x - s.a.x) / len;
  const uy = (s.b.y - s.a.y) / len;
  return { ux, uy, nx: -uy, ny: ux, len };
}

/**
 * A door/window/opening/step centred on where the wall was tapped (or mid-wall), clamped so it
 * stays on the wall. Null if the wall no longer exists.
 */
export function placeWallFeature(
  layout: Layout,
  wallId: string,
  kind: WallFeatureKind,
  id: string,
  at?: Pt,
): WallFeature | null {
  const s = segmentFor(layout.outline, wallId);
  if (!s) return null;
  const { ux, uy, len } = frame(s);
  const width = Math.min(DEFAULT_WIDTH[kind], Math.round(len));
  const along = at ? (at.x - s.a.x) * ux + (at.y - s.a.y) * uy : len / 2;
  const startAlong = Math.min(Math.max(0, snap(along - width / 2)), Math.max(0, Math.floor(len - width)));
  // Measure from whichever corner is nearer: nobody walks to the far end of a wall to tape a door.
  const fromEnd = startAlong + width / 2 > len / 2;
  const offset = fromEnd ? Math.max(0, Math.round(len - startAlong - width)) : startAlong;
  return {
    id,
    kind,
    wallId,
    from: fromEnd ? 'end' : 'start',
    offset: EMPTY,
    width: EMPTY,
    sketch: { offset, width },
  } as WallFeature;
}

/**
 * A post at the tap, anchored to the nearest corner it lies "ahead" of, with its position
 * expressed as the two distances Dana will measure: along that wall, and out from it.
 */
export function placePost(layout: Layout, at: Pt, id: string): Feature | null {
  const candidates = segments(layout.outline).map((s) => {
    const { ux, uy, nx, ny } = frame(s);
    const dx = (at.x - s.a.x) * ux + (at.y - s.a.y) * uy;
    const dy = (at.x - s.a.x) * nx + (at.y - s.a.y) * ny;
    return { s, dx, dy, d: Math.hypot(at.x - s.a.x, at.y - s.a.y) };
  });
  if (!candidates.length) return null;
  // Prefer corners the post is in front of, so "along the wall" is a positive tape reading.
  const ahead = candidates.filter((c) => c.dx >= 0);
  const best = (ahead.length ? ahead : candidates).reduce((a, b) => (b.d < a.d ? b : a));
  return {
    id,
    kind: 'post',
    cornerWallId: best.s.wallId,
    dx: EMPTY,
    dy: EMPTY,
    sketch: { dx: Math.max(0, snap(best.dx)), dy: snap(best.dy) },
  };
}

const KIND_NAME: Record<Feature['kind'], string> = {
  door: 'Door',
  window: 'Window',
  opening: 'Opening',
  step: 'Step',
  post: 'Post',
};

/** "Door 2", numbered per kind in the order features were added. */
export function featureNames(layout: Layout): Record<string, string> {
  const counts: Partial<Record<Feature['kind'], number>> = {};
  const names: Record<string, string> = {};
  for (const f of Object.values(layout.features)) {
    counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    names[f.id] = `${KIND_NAME[f.kind]} ${counts[f.kind]}`;
  }
  return names;
}
