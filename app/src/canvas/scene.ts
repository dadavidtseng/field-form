import {
  UM_PER_INCH,
  effective,
  formatLength,
  isWallFeature,
  postPosition,
  segments,
  wallFeatureSpan,
  type Feature,
  type Layout,
  type Pt,
  type UnitSystem,
} from '@field-form/shared';

// Turns a layout into flat drawing instructions in canvas world units (inches, y up).
// Inches rather than µm keep numbers small enough for Skia's 32-bit floats at any zoom.

const toIn = (p: Pt): Pt => ({ x: p.x / UM_PER_INCH, y: p.y / UM_PER_INCH });

export interface WallLine {
  id: string;
  a: Pt;
  b: Pt;
  measured: boolean;
}

export interface FeatureMark {
  id: string;
  kind: Feature['kind'];
  a: Pt;
  b: Pt;
  /** Unit normal pointing into the space (doors swing in, steps go out). */
  inward: Pt;
  /** Post side length, inches. */
  size: number;
}

export interface Label {
  key: string;
  at: Pt;
  /** Unit normal (world) to push the label off the line, away from the space. */
  offset: Pt;
  text: string;
}

export interface Scene {
  walls: WallLine[];
  features: FeatureMark[];
  labels: Label[];
}

const DEFAULT_POST_IN = 4;

/** Signed area > 0 means the walls were drawn counter-clockwise, so the inside is on the left. */
function insideIsLeft(walls: WallLine[]): boolean {
  let twice = 0;
  for (const w of walls) twice += w.a.x * w.b.y - w.b.x * w.a.y;
  return twice >= 0;
}

export function buildScene(layout: Layout, system: UnitSystem = 'imperial'): Scene {
  const segs = segments(layout.outline);
  const walls: WallLine[] = segs.map((s) => ({
    id: s.wallId,
    a: toIn(s.a),
    b: toIn(s.b),
    measured: s.closing ? layout.outline.closingLength.value !== null : s.measured,
  }));
  const left = insideIsLeft(walls);

  const inwardOf = (a: Pt, b: Pt): Pt => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    return left ? { x: nx, y: ny } : { x: -nx, y: -ny };
  };

  const labels: Label[] = segs.map((s, i) => {
    const w = walls[i]!;
    const inward = inwardOf(w.a, w.b);
    const length =
      s.closing && layout.outline.closingLength.value !== null ? layout.outline.closingLength.value : s.length;
    return {
      key: s.wallId,
      at: { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 },
      offset: { x: -inward.x, y: -inward.y },
      text: `${w.measured ? '' : '~'}${formatLength(Math.round(length), system)}`,
    };
  });

  const features: FeatureMark[] = [];
  for (const f of Object.values(layout.features)) {
    if (isWallFeature(f)) {
      const span = wallFeatureSpan(layout, f);
      if (!span) continue;
      const a = toIn(span.a);
      const b = toIn(span.b);
      features.push({ id: f.id, kind: f.kind, a, b, inward: inwardOf(a, b), size: 0 });
    } else {
      const c = postPosition(layout, f);
      if (!c) continue;
      const p = toIn(c);
      const size = effective(f.size, DEFAULT_POST_IN * UM_PER_INCH) / UM_PER_INCH;
      features.push({ id: f.id, kind: 'post', a: p, b: p, inward: { x: 0, y: 1 }, size });
    }
  }

  return { walls, features, labels };
}
