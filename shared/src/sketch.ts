import type { Pt } from './geometry';
import { EMPTY, type Wall } from './model';
import { inches, type Um } from './units';

// Turning imprecise, gloved taps into clean walls. Snapping is applied to each wall's
// absolute direction (not to the turn), so a sketched rectangle stays square even if
// every tap is a little off.

export const SNAP_DEG = 15;
export const SNAP_UM: Um = inches(6);

const snap = (v: number, step: number) => Math.round(v / step) * step;

/** Normalise an angle to (-180, 180]. */
export function normalizeDeg(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/** Snapped direction (degrees) and length (µm) of a wall from `a` towards `b`. */
export function snapWall(a: Pt, b: Pt): { headingDeg: number; length: Um } {
  const raw = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return {
    headingDeg: normalizeDeg(snap(raw, SNAP_DEG)),
    length: Math.max(SNAP_UM, snap(Math.hypot(b.x - a.x, b.y - a.y), SNAP_UM)),
  };
}

/** Where the next corner lands after snapping; used to preview a tap before it is committed. */
export function snapCorner(from: Pt, raw: Pt): Pt {
  const { headingDeg, length } = snapWall(from, raw);
  const r = (headingDeg * Math.PI) / 180;
  return { x: from.x + length * Math.cos(r), y: from.y + length * Math.sin(r) };
}

/**
 * Converts tapped corners (in order, first corner first) into unmeasured walls whose
 * sketch lengths and turns are snapped. Closing is a separate step: tapping the first
 * corner again becomes `outline.close`, not an extra wall.
 */
export function wallsFromCorners(points: Pt[], newId: () => string): Wall[] {
  const walls: Wall[] = [];
  let heading = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const w = snapWall(points[i]!, points[i + 1]!);
    walls.push({ id: newId(), turnDeg: normalizeDeg(w.headingDeg - heading), length: EMPTY, sketchUm: w.length });
    heading = w.headingDeg;
  }
  return walls;
}
