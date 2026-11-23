import { z } from 'zod';
import {
  Dimension,
  DimensionTarget,
  EMPTY,
  FEATURE_FIELDS,
  Feature,
  LayoutKind,
  Wall,
  isWallFeature,
  type Layout,
  type LayoutDoc,
} from './model';

// Ops are the only way a layout changes. The same pure reducer runs on the device
// (optimistically) and on the server (authoritatively), so they cannot disagree.

const Id = z.string().min(1).max(64);
const Name = z.string().trim().min(1).max(120);

const baseOps = [
  z.object({ t: z.literal('layout.create'), name: Name, kind: LayoutKind }),
  z.object({ t: z.literal('layout.rename'), name: Name }),
  z.object({ t: z.literal('wall.add'), wall: Wall, index: z.number().int().nonnegative().optional() }),
  z.object({
    t: z.literal('wall.update'),
    id: Id,
    patch: Wall.pick({ turnDeg: true, sketchUm: true }).partial(),
  }),
  z.object({ t: z.literal('wall.remove'), id: Id }),
  z.object({ t: z.literal('outline.close'), closingWallId: Id, closingLength: Dimension.optional() }),
  z.object({ t: z.literal('outline.open') }),
  z.object({ t: z.literal('feature.add'), feature: Feature }),
  z.object({ t: z.literal('feature.remove'), id: Id }),
  z.object({ t: z.literal('dimension.set'), target: DimensionTarget, dim: Dimension }),
] as const;

export const BaseOp = z.discriminatedUnion('t', [...baseOps]);
export type BaseOp = z.infer<typeof BaseOp>;

/** One user action = one op. A batch applies all of its ops or none, and undoes as one step. */
export const Op = z.discriminatedUnion('t', [
  ...baseOps,
  z.object({ t: z.literal('batch'), ops: z.array(BaseOp).max(500) }),
]);
export type Op = z.infer<typeof Op>;

/** A domain precondition failed. Maps to the `conflict` rejection code. */
export class OpError extends Error {
  readonly code = 'conflict' as const;
  constructor(message: string) {
    super(message);
    this.name = 'OpError';
  }
}

export interface Applied {
  doc: LayoutDoc;
  /** Applying this op to `doc` restores the previous document. Undo sends it as a new op. */
  inverse: Op;
}

/**
 * Pure: never mutates `doc`. Throws OpError on a failed precondition, in which case the
 * caller still holds the untouched previous document, which is what makes batches atomic.
 */
export function applyWithInverse(doc: LayoutDoc, op: Op): Applied {
  if (op.t === 'batch') {
    let current = doc;
    const inverse: BaseOp[] = [];
    for (const step of op.ops) {
      const r = applyBase(current, step);
      current = r.doc;
      inverse.unshift(...r.inverse); // undo in reverse order
    }
    return { doc: current, inverse: { t: 'batch', ops: inverse } };
  }
  const r = applyBase(doc, op);
  const [only] = r.inverse;
  return { doc: r.doc, inverse: r.inverse.length === 1 && only ? only : { t: 'batch', ops: r.inverse } };
}

export const applyOp = (doc: LayoutDoc, op: Op): LayoutDoc => applyWithInverse(doc, op).doc;

interface BaseApplied {
  doc: Layout;
  inverse: BaseOp[];
}

function applyBase(doc: LayoutDoc, op: BaseOp): BaseApplied {
  if (op.t === 'layout.create') {
    if (doc) throw new OpError('Layout already exists');
    return {
      doc: {
        name: op.name,
        kind: op.kind,
        outline: { walls: [], closingWallId: null, closingLength: EMPTY },
        features: {},
      },
      inverse: [], // layouts are never removed by undo
    };
  }
  if (!doc) throw new OpError('Layout does not exist yet');
  const { outline } = doc;

  switch (op.t) {
    case 'layout.rename':
      return { doc: { ...doc, name: op.name }, inverse: [{ t: 'layout.rename', name: doc.name }] };

    case 'wall.add': {
      if (hasWall(doc, op.wall.id)) throw new OpError(`Wall ${op.wall.id} already exists`);
      const index = op.index ?? outline.walls.length;
      if (index > outline.walls.length) throw new OpError('Wall index out of range');
      const walls = [...outline.walls];
      walls.splice(index, 0, op.wall);
      return { doc: withOutline(doc, { walls }), inverse: [{ t: 'wall.remove', id: op.wall.id }] };
    }

    case 'wall.update': {
      const wall = findWall(doc, op.id);
      const before = Object.fromEntries(
        Object.keys(op.patch).map((k) => [k, wall[k as keyof typeof op.patch]]),
      ) as typeof op.patch;
      const walls = outline.walls.map((w) => (w.id === op.id ? { ...w, ...op.patch } : w));
      return { doc: withOutline(doc, { walls }), inverse: [{ t: 'wall.update', id: op.id, patch: before }] };
    }

    case 'wall.remove': {
      const index = outline.walls.findIndex((w) => w.id === op.id);
      const wall = outline.walls[index];
      if (!wall) throw new OpError(`Wall ${op.id} does not exist`);
      const { kept, removed } = detachFeatures(doc, op.id);
      return {
        doc: { ...withOutline(doc, { walls: outline.walls.filter((w) => w.id !== op.id) }), features: kept },
        // Restore the wall at the same position, then everything that was attached to it.
        inverse: [{ t: 'wall.add', wall, index }, ...removed.map((f) => ({ t: 'feature.add', feature: f }) as const)],
      };
    }

    case 'outline.close': {
      if (outline.closingWallId) throw new OpError('Outline is already closed');
      if (outline.walls.length < 2) throw new OpError('Draw at least two walls before closing');
      if (hasWall(doc, op.closingWallId)) throw new OpError(`Wall ${op.closingWallId} already exists`);
      return {
        doc: withOutline(doc, { closingWallId: op.closingWallId, closingLength: op.closingLength ?? EMPTY }),
        inverse: [{ t: 'outline.open' }],
      };
    }

    case 'outline.open': {
      const id = outline.closingWallId;
      if (!id) throw new OpError('Outline is not closed');
      const { kept, removed } = detachFeatures(doc, id);
      return {
        doc: { ...withOutline(doc, { closingWallId: null, closingLength: EMPTY }), features: kept },
        inverse: [
          { t: 'outline.close', closingWallId: id, closingLength: outline.closingLength },
          ...removed.map((f) => ({ t: 'feature.add', feature: f }) as const),
        ],
      };
    }

    case 'feature.add': {
      const f = op.feature;
      if (doc.features[f.id]) throw new OpError(`Feature ${f.id} already exists`);
      const anchor = isWallFeature(f) ? f.wallId : f.cornerWallId;
      if (!hasWall(doc, anchor)) throw new OpError(`Cannot add ${f.kind}: its wall was deleted`);
      return {
        doc: { ...doc, features: { ...doc.features, [f.id]: f } },
        inverse: [{ t: 'feature.remove', id: f.id }],
      };
    }

    case 'feature.remove': {
      const f = doc.features[op.id];
      if (!f) throw new OpError(`Feature ${op.id} does not exist`);
      const { [op.id]: _removed, ...features } = doc.features;
      return { doc: { ...doc, features }, inverse: [{ t: 'feature.add', feature: f }] };
    }

    case 'dimension.set': {
      const before = readDimension(doc, op.target);
      return {
        doc: writeDimension(doc, op.target, op.dim),
        inverse: [{ t: 'dimension.set', target: op.target, dim: before }],
      };
    }
  }
}

// ---- helpers ----

function withOutline(doc: Layout, patch: Partial<Layout['outline']>): Layout {
  return { ...doc, outline: { ...doc.outline, ...patch } };
}

/** True for any drawn wall or the closing wall. */
function hasWall(doc: Layout, id: string): boolean {
  return doc.outline.closingWallId === id || doc.outline.walls.some((w) => w.id === id);
}

function findWall(doc: Layout, id: string): Wall {
  const wall = doc.outline.walls.find((w) => w.id === id);
  if (!wall) throw new OpError(`Wall ${id} does not exist`);
  return wall;
}

/** Features anchored to a wall, or to the corner that wall starts at, go with it. */
function detachFeatures(doc: Layout, wallId: string) {
  const kept: Record<string, Feature> = {};
  const removed: Feature[] = [];
  for (const f of Object.values(doc.features)) {
    const anchor = isWallFeature(f) ? f.wallId : f.cornerWallId;
    if (anchor === wallId) removed.push(f);
    else kept[f.id] = f;
  }
  return { kept, removed };
}

function featureField(doc: Layout, featureId: string, field: string): Feature {
  const f = doc.features[featureId];
  if (!f) throw new OpError(`Feature ${featureId} does not exist`);
  if (!(FEATURE_FIELDS[f.kind] as readonly string[]).includes(field)) {
    throw new OpError(`A ${f.kind} has no ${field} measurement`);
  }
  return f;
}

function readDimension(doc: Layout, target: DimensionTarget): Dimension {
  switch (target.kind) {
    case 'wall':
      return findWall(doc, target.wallId).length;
    case 'closing':
      if (!doc.outline.closingWallId) throw new OpError('Outline is not closed');
      return doc.outline.closingLength;
    case 'feature': {
      const f = featureField(doc, target.featureId, target.field);
      return ((f as Record<string, unknown>)[target.field] as Dimension | undefined) ?? EMPTY;
    }
  }
}

function writeDimension(doc: Layout, target: DimensionTarget, dim: Dimension): Layout {
  switch (target.kind) {
    case 'wall':
      findWall(doc, target.wallId);
      return withOutline(doc, {
        walls: doc.outline.walls.map((w) => (w.id === target.wallId ? { ...w, length: dim } : w)),
      });
    case 'closing':
      return withOutline(doc, { closingLength: dim });
    case 'feature': {
      const f = featureField(doc, target.featureId, target.field);
      return { ...doc, features: { ...doc.features, [f.id]: { ...f, [target.field]: dim } as Feature } };
    }
  }
}
