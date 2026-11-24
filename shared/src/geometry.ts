import {
  isWallFeature,
  type Dimension,
  type DimensionTarget,
  type Feature,
  type Layout,
  type Outline,
  type Wall,
} from './model';
import { UM_PER_FOOT, type Um } from './units';

// All geometry is derived from the walls and never stored, so it can never disagree
// with the measurements. World coordinates are µm, x right, y up, first corner at the origin.

export interface Pt {
  x: number;
  y: number;
}

export interface Segment {
  wallId: string;
  a: Pt;
  b: Pt;
  length: number;
  measured: boolean;
  closing: boolean;
}

export const effective = (d: Dimension | undefined, sketch: number): number => d?.value ?? sketch;
export const wallLength = (w: Wall): Um => effective(w.length, w.sketchUm);

const rad = (deg: number) => (deg * Math.PI) / 180;
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Corner positions: the origin, then the end of each drawn wall in order. */
export function corners(outline: Outline): Pt[] {
  const pts: Pt[] = [{ x: 0, y: 0 }];
  let heading = 0;
  let p = pts[0]!;
  for (const w of outline.walls) {
    heading += w.turnDeg;
    const len = wallLength(w);
    p = { x: p.x + len * Math.cos(rad(heading)), y: p.y + len * Math.sin(rad(heading)) };
    pts.push(p);
  }
  return pts;
}

/** Every wall as a line segment, plus the derived closing wall when the outline is closed. */
export function segments(outline: Outline): Segment[] {
  const pts = corners(outline);
  const segs: Segment[] = outline.walls.map((w, i) => ({
    wallId: w.id,
    a: pts[i]!,
    b: pts[i + 1]!,
    length: wallLength(w),
    measured: w.length.value !== null,
    closing: false,
  }));
  if (outline.closingWallId) {
    const a = pts[pts.length - 1]!;
    const b = pts[0]!;
    segs.push({ wallId: outline.closingWallId, a, b, length: dist(a, b), measured: false, closing: true });
  }
  return segs;
}

export interface Closure {
  /** Closing wall length implied by the other walls. */
  computed: Um;
  /** What Dana measured for the closing wall, if anything. */
  measured: Um | null;
  /** measured − computed. Shown, never corrected: a misread tape stays visible. */
  error: Um | null;
}

export function closure(outline: Outline): Closure | null {
  const closing = segments(outline).find((s) => s.closing);
  if (!closing) return null;
  const computed = Math.round(closing.length);
  const measured = outline.closingLength.value;
  return { computed, measured, error: measured === null ? null : measured - computed };
}

/** Linear length: fences and trim. Includes the computed closing wall when closed. */
export const perimeter = (outline: Outline): Um => Math.round(segments(outline).reduce((sum, s) => sum + s.length, 0));

/** Enclosed area in µm² (shoelace), or null for an open outline. */
export function area(outline: Outline): number | null {
  if (!outline.closingWallId) return null;
  const pts = corners(outline);
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

export const SQ_UM_PER_SQ_FT = UM_PER_FOOT * UM_PER_FOOT;

/** The segment a wall id refers to, including the closing wall. */
export function segmentFor(outline: Outline, wallId: string): Segment | undefined {
  return segments(outline).find((s) => s.wallId === wallId);
}

/** Unit vector along a segment and its left-hand normal. */
function frame(s: Segment) {
  const len = dist(s.a, s.b) || 1;
  const ux = (s.b.x - s.a.x) / len;
  const uy = (s.b.y - s.a.y) / len;
  return { ux, uy, nx: -uy, ny: ux };
}

/** Start and end of a door/window/opening/step along its wall, using sketch values until measured. */
export function wallFeatureSpan(layout: Layout, f: Exclude<Feature, { kind: 'post' }>): { a: Pt; b: Pt } | null {
  const s = segmentFor(layout.outline, f.wallId);
  if (!s) return null;
  const { ux, uy } = frame(s);
  const offset = effective(f.offset, f.sketch.offset);
  const width = effective(f.width, f.sketch.width);
  // The offset runs from whichever end of the wall the feature is measured from.
  const start = f.from === 'end' ? s.length - offset - width : offset;
  const end = start + width;
  return {
    a: { x: s.a.x + ux * start, y: s.a.y + uy * start },
    b: { x: s.a.x + ux * end, y: s.a.y + uy * end },
  };
}

/** A dimension line to draw for the measurement Dana is about to take. */
export interface Guide {
  /** The two ends of the distance being measured. */
  a: Pt;
  b: Pt;
  /** The corner the distance is measured from (shown as the yellow corner). */
  corner: Pt;
  /** Unit direction to push the line off the wall on screen, so it does not sit on top of it. */
  normal: Pt;
  /** The wall the guide is drawn beside, whose own length label it replaces while shown. */
  wallId: string | null;
}

/** True when the inside of the outline is to the left of each wall (drawn counter-clockwise). */
function insideIsLeft(outline: Outline): boolean {
  const pts = corners(outline);
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return twice >= 0;
}

/** What to draw so Dana can see exactly which distance the armed measurement means. */
export function measureGuide(layout: Layout, target: DimensionTarget): Guide | null {
  if (target.kind !== 'feature') return null;
  const f = layout.features[target.featureId];
  if (!f) return null;

  if (f.kind === 'post') {
    const s = segmentFor(layout.outline, f.cornerWallId);
    const c = postPosition(layout, f);
    if (!s || !c) return null;
    const { ux, uy } = frame(s);
    const along = effective(f.dx, f.sketch.dx);
    const foot = { x: s.a.x + ux * along, y: s.a.y + uy * along };
    const line = target.field === 'dx' ? { a: s.a, b: foot } : { a: foot, b: c };
    return { ...line, corner: s.a, normal: { x: 0, y: 0 }, wallId: null };
  }

  const s = segmentFor(layout.outline, f.wallId);
  const span = wallFeatureSpan(layout, f);
  const out = outwardNormal(layout.outline, f.wallId);
  if (!s || !span || !out) return null;
  const fromEnd = f.from === 'end';
  const corner = fromEnd ? s.b : s.a;
  const line = target.field === 'offset' ? { a: corner, b: fromEnd ? span.b : span.a } : { a: span.a, b: span.b };
  return { ...line, corner, normal: out, wallId: f.wallId };
}

/** Unit normal pointing out of the space from a wall (including the closing wall), or null. */
export function outwardNormal(outline: Outline, wallId: string): Pt | null {
  const s = segmentFor(outline, wallId);
  if (!s) return null;
  const { nx, ny } = frame(s);
  return insideIsLeft(outline) ? { x: -nx, y: -ny } : { x: nx, y: ny };
}

/** Post centre. Measured offsets are distances; the side of the wall comes from the sketch tap. */
export function postPosition(layout: Layout, f: Extract<Feature, { kind: 'post' }>): Pt | null {
  const s = segmentFor(layout.outline, f.cornerWallId);
  if (!s) return null;
  const { ux, uy, nx, ny } = frame(s);
  const along = effective(f.dx, f.sketch.dx);
  const side = f.sketch.dy < 0 ? -1 : 1;
  const out = f.dy.value === null ? f.sketch.dy : side * f.dy.value;
  return { x: s.a.x + ux * along + nx * out, y: s.a.y + uy * along + ny * out };
}

/** False when a wall feature no longer fits its wall (e.g. after a re-measure). Flagged, never moved. */
export function featureFits(layout: Layout, f: Feature): boolean {
  if (!isWallFeature(f)) return true;
  const s = segmentFor(layout.outline, f.wallId);
  if (!s) return false;
  const end = effective(f.offset, f.sketch.offset) + effective(f.width, f.sketch.width);
  return end <= s.length + 1; // 1 µm slack for float rounding
}

export type Hit = { kind: 'wall'; id: string } | { kind: 'feature'; id: string };

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * What a tap at `p` refers to, within `radius` (world µm; callers convert a glove-sized
 * screen radius). Features win over the wall they sit on, so a door is selectable.
 */
export function hitTest(layout: Layout, p: Pt, radius: number): Hit | null {
  let best: { hit: Hit; d: number } | null = null;
  const consider = (hit: Hit, d: number, bias = 0) => {
    if (d <= radius && (!best || d - bias < best.d)) best = { hit, d: d - bias };
  };
  for (const f of Object.values(layout.features)) {
    if (isWallFeature(f)) {
      const span = wallFeatureSpan(layout, f);
      if (span) consider({ kind: 'feature', id: f.id }, distanceToSegment(p, span.a, span.b), radius);
    } else {
      const c = postPosition(layout, f);
      if (c) consider({ kind: 'feature', id: f.id }, dist(p, c), radius);
    }
  }
  for (const s of segments(layout.outline)) consider({ kind: 'wall', id: s.wallId }, distanceToSegment(p, s.a, s.b));
  return (best as { hit: Hit } | null)?.hit ?? null;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Extent of everything drawn (corners and posts), or null for an empty layout. */
export function bounds(layout: Layout): Bounds | null {
  const pts = layout.outline.walls.length ? corners(layout.outline) : [];
  for (const f of Object.values(layout.features)) {
    if (f.kind === 'post') {
      const c = postPosition(layout, f);
      if (c) pts.push(c);
    }
  }
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}
