import {
  featureNames,
  formatLength,
  layoutSummary,
  measureSlots,
  formatArea,
  type CommentTarget,
  type Layout,
  type LayoutSummary,
  type Slot,
  type UnitSystem,
} from '@field-form/shared';

// Pure functions that turn a space into what Claude reads, and Claude's words back into ids.
// Kept free of I/O so they are unit-tested without a server.

/** A space by exact id, else by name (case-insensitive, partial). Ambiguity is an error, not a guess. */
export function findSpace(spaces: LayoutSummary[], query: string): LayoutSummary {
  const exact = spaces.find((s) => s.id === query);
  if (exact) return exact;
  const q = query.trim().toLowerCase();
  const byName = spaces.filter((s) => s.name.toLowerCase().includes(q));
  if (byName.length === 1) return byName[0]!;
  if (byName.length === 0) throw new Error(`No space matches "${query}". Use list_spaces to see them.`);
  throw new Error(`"${query}" matches ${byName.length} spaces: ${byName.map((s) => `"${s.name}"`).join(', ')}.`);
}

const fmt = (um: number | null, system: UnitSystem, detail = false) =>
  um === null ? null : formatLength(um, system, detail);

/** What each feature measurement means, for a reader who cannot see the app's corner marker. */
const MEASUREMENT: Record<string, string> = {
  width: 'width',
  offset: 'offset from the wall corner',
  dx: 'along the wall from its start corner',
  dy: 'out from that wall',
  height: 'height',
  sill: 'sill height',
  rise: 'rise',
  run: 'run (tread depth)',
  size: 'size',
};

function describeSlot(s: Slot, system: UnitSystem) {
  return {
    measurement: s.target.kind === 'feature' ? (MEASUREMENT[s.target.field] ?? s.target.field) : 'length',
    value: fmt(s.value, system, s.detail),
    ...(s.value === null ? { sketchEstimate: fmt(s.estimateUm, system, s.detail) } : {}),
    ...(s.dim?.source
      ? {
          source: s.dim.source,
          device: s.dim.device,
          capturedAt: s.dim.capturedAt ? new Date(s.dim.capturedAt).toISOString() : undefined,
        }
      : {}),
    ...(s.optional ? { optional: true } : {}),
  };
}

/** Everything an estimator needs about one space, in plain values Claude can reason about. */
export function describeSpace(layout: Layout, system: UnitSystem = 'imperial') {
  const slots = measureSlots(layout);
  const names = featureNames(layout);
  const sum = layoutSummary(layout);
  // Short names Claude can say back to add_comment: "Wall 2", "Last wall", "Door 1".
  const walls = slots
    .filter((s) => s.target.kind !== 'feature')
    .map((s, i) => ({
      id: s.target.kind === 'wall' ? s.target.wallId : layout.outline.closingWallId,
      name: s.target.kind === 'closing' ? 'Last wall' : `Wall ${i + 1}`,
      ...describeSlot(s, system),
    }));
  const features = Object.values(layout.features).map((f) => ({
    id: f.id,
    name: names[f.id],
    kind: f.kind,
    ...(f.kind === 'post'
      ? { fromCornerOf: walls.find((w) => w.id === f.cornerWallId)?.name }
      : {
          onWall: walls.find((w) => w.id === f.wallId)?.name,
          offsetMeasuredFrom: f.from === 'end' ? 'end corner of the wall' : 'start corner of the wall',
        }),
    measurements: slots
      .filter((s) => s.target.kind === 'feature' && s.target.featureId === f.id)
      .map((s) => describeSlot(s, system)),
  }));
  const targetName = (t: CommentTarget) =>
    !t ? 'whole space' : t.kind === 'wall' ? walls.find((w) => w.id === t.wallId)?.name : names[t.featureId];
  return {
    name: layout.name,
    shape: layout.outline.closingWallId ? 'closed shape' : 'open line',
    units: system === 'imperial' ? 'feet-inches' : 'millimetres',
    [sum.areaSqUm === null ? 'length' : 'perimeter']: fmt(sum.perimeterUm, system),
    ...(sum.areaSqUm !== null ? { area: formatArea(sum.areaSqUm, system) } : {}),
    ...(sum.closure
      ? { closureError: fmt(Math.abs(sum.closure.errorUm), system), closureCheck: sum.closure.level }
      : {}),
    progress: `${sum.measured} of ${sum.total} required measurements taken`,
    readyToQuote: sum.readyToQuote,
    ...(sum.misfitIds.length ? { doesNotFit: sum.misfitIds.map((id) => names[id]) } : {}),
    stillToMeasure: [
      ...walls.filter((w) => w.value === null).map((w) => w.name),
      ...features.flatMap((f) =>
        f.measurements.filter((m) => m.value === null && !m.optional).map((m) => `${f.name} ${m.measurement}`),
      ),
    ],
    walls,
    features,
    comments: Object.values(layout.comments ?? {}).map((c) => ({
      id: c.id,
      on: targetName(c.target),
      tag: c.tag,
      text: c.text,
      by: c.by,
      at: new Date(c.at).toISOString(),
      resolved: c.resolved,
    })),
  };
}

/**
 * What a comment should be pinned to, from an id or a name Claude read in get_space
 * ("Wall 2", "Door 1", "Last wall"). Omitted means the whole space.
 */
export function resolveTarget(layout: Layout, target: string | undefined): CommentTarget {
  if (!target || /^(space|whole space|this space)$/i.test(target.trim())) return null;
  const t = target.trim();
  const closingId = layout.outline.closingWallId;
  if (layout.outline.walls.some((w) => w.id === t) || t === closingId) return { kind: 'wall', wallId: t };
  if (layout.features[t]) return { kind: 'feature', featureId: t };

  const lower = t.toLowerCase();
  const names = featureNames(layout);
  const feature = Object.keys(names).find((id) => names[id]!.toLowerCase() === lower);
  if (feature) return { kind: 'feature', featureId: feature };

  const wallNumber = /^wall\s+(\d+)$/i.exec(t)?.[1];
  const segmentCount = layout.outline.walls.length + (closingId ? 1 : 0);
  if (wallNumber) {
    const n = Number(wallNumber);
    if (n >= 1 && n <= layout.outline.walls.length) return { kind: 'wall', wallId: layout.outline.walls[n - 1]!.id };
    if (closingId && n === segmentCount) return { kind: 'wall', wallId: closingId };
  }
  if (closingId && /^(last wall|closing wall)/i.test(t)) return { kind: 'wall', wallId: closingId };
  throw new Error(`No wall or feature called "${target}" in this space. Use get_space to see the names.`);
}
