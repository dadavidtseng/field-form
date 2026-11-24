import { featureNames } from './features';
import { SQ_UM_PER_SQ_FT, area, closure, perimeter, segments } from './geometry';
import { DETAIL_FIELDS, type Dimension, type DimensionTarget, type Feature, type Layout } from './model';
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
  /** Nice to have (door height, sill, post size…): never auto-armed, never blocks "ready to quote". */
  optional: boolean;
  /** Fine detail measured with calipers by default, and shown to 1/32" / 0.01 mm. */
  detail: boolean;
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
      optional: false,
      detail: false,
    };
  });

  // Then each feature's measurements, in the order the features were added: the two that fix
  // its position and size, then its optional extras.
  const names = featureNames(layout);
  const featureSlots: Slot[] = Object.values(layout.features).flatMap((f) =>
    [...BASIC_FIELDS[f.kind], ...OPTIONAL_FIELDS[f.kind]].map((field) => {
      const target: DimensionTarget = { kind: 'feature', featureId: f.id, field };
      const dim = (f as Record<string, unknown>)[field] as Dimension | undefined;
      const optional = OPTIONAL_FIELDS[f.kind].includes(field);
      return {
        target,
        key: targetKey(target),
        label: `${names[f.id]} · ${FIELD_LABEL[field]}`,
        estimateUm: optional ? (OPTIONAL_ESTIMATE[field] ?? 0) : Math.abs(sketchFor(f, field)),
        value: dim?.value ?? null,
        dim: dim ?? null,
        optional,
        detail: DETAIL_FIELDS.has(field),
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

/** Extras for quoting and cut lists; measured only when they matter for the job. */
const OPTIONAL_FIELDS: Record<Feature['kind'], string[]> = {
  door: ['height'],
  window: ['sill', 'height'],
  opening: [],
  step: ['rise', 'run'],
  post: ['size'],
};

/** Typical values offered as the next reading until measured. */
const OPTIONAL_ESTIMATE: Record<string, Um> = {
  height: inches(80),
  sill: inches(36),
  rise: inches(7),
  run: inches(11),
  size: inches(3.5), // a nominal 4x4 post
};

// Labels refer to what the canvas shows: the yellow corner and the dimension line.
const FIELD_LABEL: Record<string, string> = {
  width: 'width',
  offset: 'from the yellow corner',
  dx: 'along the wall from the yellow corner',
  dy: 'out from that wall',
  height: 'height',
  sill: 'sill height',
  rise: 'rise',
  run: 'run (tread depth)',
  size: 'size',
};

function sketchFor(f: Feature, field: string): Um {
  if (f.kind === 'post') return field === 'dx' ? f.sketch.dx : f.sketch.dy;
  return field === 'offset' ? f.sketch.offset : f.sketch.width;
}

/** True for a slot that measures a feature, as opposed to a wall. */
export const isFeatureSlot = (s: Slot): boolean => s.target.kind === 'feature';

/**
 * The next empty required slot after `afterKey` (wrapping round), or null when everything
 * required is measured. Optional extras are never auto-armed; Dana picks them when they matter.
 */
export function nextUnmeasured(slots: Slot[], afterKey?: string | null): Slot | null {
  const start = afterKey ? slots.findIndex((s) => s.key === afterKey) + 1 : 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[(start + i) % slots.length]!;
    if (s.value === null && !s.optional) return s;
  }
  return null;
}

/** Progress counts only what a quote needs; optional extras never hold it up. */
export function requiredProgress(slots: Slot[]): { measured: number; total: number } {
  const required = slots.filter((s) => !s.optional);
  return { measured: required.filter((s) => s.value !== null).length, total: required.length };
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
  /** Unresolved comments: an open question also means "not ready to quote". */
  openComments: number;
}

/** What an estimator needs first: size, how trustworthy it is, and what is still missing. */
export function layoutSummary(layout: Layout): LayoutSummaryNumbers {
  const slots = measureSlots(layout);
  const sqUm = area(layout.outline);
  return {
    perimeterUm: perimeter(layout.outline),
    areaSqFt: sqUm === null ? null : sqUm / SQ_UM_PER_SQ_FT,
    closure: closureCheck(layout),
    ...requiredProgress(slots),
    openComments: Object.values(layout.comments ?? {}).filter((c) => !c.resolved).length,
  };
}
