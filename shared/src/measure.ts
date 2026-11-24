import { featureNames } from './features';
import { SQ_UM_PER_SQ_FT, area, closure, perimeter, segments } from './geometry';
import type { Dimension, DimensionTarget, Feature, Layout } from './model';
import { inches, type Um } from './units';

// The measuring flow: which slots exist, in what order Dana fills them, and how far
// a closed outline is out once the closing wall is measured.

export interface Slot {
  target: DimensionTarget;
  /** Stable key for React lists and "which slot is armed". */
  key: string;
  label: string;
  /** What the slot shows until measured (sketch or computed length). */
  estimateUm: Um;
  value: Um | null;
  /** The stored measurement with its provenance (source, device, time, who), if any. */
  dim: Dimension | null;
}

export function targetKey(t: DimensionTarget): string {
  switch (t.kind) {
    case 'wall':
      return `wall:${t.wallId}`;
    case 'closing':
      return 'closing';
    case 'feature':
      return `feature:${t.featureId}:${t.field}`;
  }
}

/** Every measurable slot, in walking order: drawn walls, then the closing wall. */
export function measureSlots(layout: Layout): Slot[] {
  const segs = segments(layout.outline);
  const total = segs.length;
  const wallSlots: Slot[] = segs.map((s, i) => {
    const target: DimensionTarget = s.closing ? { kind: 'closing' } : { kind: 'wall', wallId: s.wallId };
    const dim = s.closing
      ? layout.outline.closingLength
      : (layout.outline.walls.find((w) => w.id === s.wallId)?.length ?? null);
    const value = dim?.value ?? null;
    return {
      target,
      key: targetKey(target),
      label: s.closing ? `Last wall · back to start (${i + 1} of ${total})` : `Wall ${i + 1} of ${total}`,
      estimateUm: Math.round(s.length),
      value,
      dim,
    };
  });

  // Then each feature's two basic measurements, in the order the features were added.
  const names = featureNames(layout);
  const featureSlots: Slot[] = Object.values(layout.features).flatMap((f) =>
    BASIC_FIELDS[f.kind].map((field) => {
      const target: DimensionTarget = { kind: 'feature', featureId: f.id, field };
      const dim = (f as Record<string, unknown>)[field] as Dimension | undefined;
      return {
        target,
        key: targetKey(target),
        label: `${names[f.id]} · ${FIELD_LABEL[field]}`,
        estimateUm: Math.abs(sketchFor(f, field)),
        value: dim?.value ?? null,
        dim: dim ?? null,
      };
    }),
  );
  return [...wallSlots, ...featureSlots];
}

/** The two measurements that fix a feature's position and size; the rest are optional extras. */
// Width first: it is the thing Dana is looking at. Then where it sits.
const BASIC_FIELDS: Record<Feature['kind'], string[]> = {
  door: ['width', 'offset'],
  window: ['width', 'offset'],
  opening: ['width', 'offset'],
  step: ['width', 'offset'],
  post: ['dx', 'dy'],
};

// Labels refer to what the canvas shows: the yellow corner and the dimension line.
const FIELD_LABEL: Record<string, string> = {
  width: 'width',
  offset: 'from the yellow corner',
  dx: 'along the wall from the yellow corner',
  dy: 'out from that wall',
};

function sketchFor(f: Feature, field: string): Um {
  if (f.kind === 'post') return field === 'dx' ? f.sketch.dx : f.sketch.dy;
  return field === 'offset' ? f.sketch.offset : f.sketch.width;
}

/** True for a slot that measures a feature, as opposed to a wall. */
export const isFeatureSlot = (s: Slot): boolean => s.target.kind === 'feature';

/** The next empty slot after `afterKey` (wrapping round), or null when everything is measured. */
export function nextUnmeasured(slots: Slot[], afterKey?: string | null): Slot | null {
  const start = afterKey ? slots.findIndex((s) => s.key === afterKey) + 1 : 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[(start + i) % slots.length]!;
    if (s.value === null) return s;
  }
  return null;
}

export type ClosureLevel = 'ok' | 'warn' | 'bad';

/** Within 1/4" is normal tape slop; up to 1" is worth a second look; beyond that, re-measure. */
export function closureLevel(errorUm: Um): ClosureLevel {
  const e = Math.abs(errorUm);
  if (e <= inches(0.25)) return 'ok';
  if (e <= inches(1)) return 'warn';
  return 'bad';
}

/** Closure error of a closed, closing-measured outline, or null if it cannot be judged yet. */
export function closureCheck(layout: Layout): { errorUm: Um; level: ClosureLevel } | null {
  const c = closure(layout.outline);
  if (!c || c.error === null) return null;
  return { errorUm: c.error, level: closureLevel(c.error) };
}

export interface LayoutSummaryNumbers {
  /** Linear length: fences and trim. Uses measured lengths where taken, sketch estimates otherwise. */
  perimeterUm: Um;
  /** Square feet for closed shapes (decks, floors); null for an open line. */
  areaSqFt: number | null;
  closure: { errorUm: Um; level: ClosureLevel } | null;
  measured: number;
  total: number;
}

/** What an estimator needs first: size, how trustworthy it is, and what is still missing. */
export function layoutSummary(layout: Layout): LayoutSummaryNumbers {
  const slots = measureSlots(layout);
  const sqUm = area(layout.outline);
  return {
    perimeterUm: perimeter(layout.outline),
    areaSqFt: sqUm === null ? null : sqUm / SQ_UM_PER_SQ_FT,
    closure: closureCheck(layout),
    measured: slots.filter((s) => s.value !== null).length,
    total: slots.length,
  };
}
