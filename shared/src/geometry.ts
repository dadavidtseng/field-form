import { isWallFeature, type Dimension, type Feature, type Layout, type Outline, type Wall } from './model';
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
  const start = effective(f.offset, f.sketch.offset);
  const end = start + effective(f.width, f.sketch.width);
  return {
    a: { x: s.a.x + ux * start, y: s.a.y + uy * start },
    b: { x: s.a.x + ux * end, y: s.a.y + uy * end },
  };
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
