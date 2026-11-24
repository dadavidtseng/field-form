import {
  outwardNormal,
  postPosition,
  segmentFor,
  wallFeatureSpan,
  type Comment,
  type CommentTarget,
  type DimensionTarget,
  type Layout,
  type Pt,
} from '@field-form/shared';

/** The comment target for whatever is armed or selected (a measurement belongs to its wall or feature). */
export function commentTargetFor(layout: Layout, armed: DimensionTarget | null): CommentTarget {
  if (!armed) return null;
  if (armed.kind === 'wall') return { kind: 'wall', wallId: armed.wallId };
  if (armed.kind === 'closing')
    return layout.outline.closingWallId ? { kind: 'wall', wallId: layout.outline.closingWallId } : null;
  return { kind: 'feature', featureId: armed.featureId };
}

const sameTarget = (a: CommentTarget, b: CommentTarget) =>
  a === null || b === null
    ? a === b
    : a.kind === 'wall' && b.kind === 'wall'
      ? a.wallId === b.wallId
      : a.kind === 'feature' && b.kind === 'feature' && a.featureId === b.featureId;

/** Comments pinned to one target, newest first. */
export function commentsOn(layout: Layout, target: CommentTarget): Comment[] {
  return Object.values(layout.comments ?? {})
    .filter((c) => sameTarget(c.target, target))
    .sort((a, b) => b.at - a.at);
}

export interface Pin {
  key: string;
  /** World µm. */
  at: Pt;
  count: number;
  /** Unit direction (world) to place the badge: into the space, away from labels and guides outside. */
  inward: Pt;
}

/** One badge per wall or feature with open comments, at its middle. Space-wide comments have no pin. */
export function pinsFor(layout: Layout): Pin[] {
  const counts = new Map<string, { target: NonNullable<CommentTarget>; count: number }>();
  for (const c of Object.values(layout.comments ?? {})) {
    if (c.resolved || !c.target) continue;
    const key = c.target.kind === 'wall' ? `w:${c.target.wallId}` : `f:${c.target.featureId}`;
    counts.set(key, { target: c.target, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  const inwardFrom = (wallId: string): Pt => {
    const out = outwardNormal(layout.outline, wallId);
    return out ? { x: -out.x, y: -out.y } : DIAGONAL;
  };
  const pins: Pin[] = [];
  for (const [key, { target, count }] of counts) {
    let at: Pt | null = null;
    let inward = DIAGONAL;
    if (target.kind === 'wall') {
      const s = segmentFor(layout.outline, target.wallId);
      if (s) at = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
      inward = inwardFrom(target.wallId);
    } else {
      const f = layout.features[target.featureId];
      if (f?.kind === 'post') at = postPosition(layout, f);
      else if (f) {
        const span = wallFeatureSpan(layout, f);
        if (span) at = { x: (span.a.x + span.b.x) / 2, y: (span.a.y + span.b.y) / 2 };
        inward = inwardFrom(f.wallId);
      }
    }
    if (at) pins.push({ key, at, count, inward });
  }
  return pins;
}

/** Posts are already inside the space, so their badge simply sits up and to the right. */
const DIAGONAL: Pt = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
