import { z } from 'zod';

// Domain model. Every schema here is also the wire format, so the server can validate
// untrusted input against exactly the types both sides compile against.

const Id = z.string().min(1).max(64);
const LengthUm = z.number().int().nonnegative();

export const LayoutKind = z.enum(['room', 'deck', 'patio', 'fence', 'other']);
export type LayoutKind = z.infer<typeof LayoutKind>;

export const MeasurementSource = z.enum(['tape', 'caliper', 'manual']);
export type MeasurementSource = z.infer<typeof MeasurementSource>;

/** A measurable slot. `value` stays null until measured; provenance tells Marcus how it was captured. */
export const Dimension = z.object({
  value: LengthUm.nullable(),
  source: MeasurementSource.optional(),
  device: z.string().max(64).optional(),
  capturedAt: z.number().optional(),
  capturedBy: z.string().max(64).optional(),
});
export type Dimension = z.infer<typeof Dimension>;

export const EMPTY: Dimension = { value: null };

/**
 * One drawn wall. Geometry is derived from the ordered walls ("turtle" style): each wall
 * turns relative to the previous one, then runs for its measured length, or its sketch
 * estimate until measured. So re-measuring wall 3 moves every later corner automatically.
 */
export const Wall = z.object({
  id: Id,
  /** Turn applied before this wall, degrees, positive = left. The first wall's turn is its absolute heading. */
  turnDeg: z.number().gt(-360).lt(360),
  length: Dimension,
  sketchUm: LengthUm.positive(),
});
export type Wall = z.infer<typeof Wall>;

/**
 * The closing wall (last corner back to the start) is derived geometry, but it is a real,
 * addressable wall: it has a stable id so features can attach to it, and Dana may measure it.
 */
export const Outline = z.object({
  walls: z.array(Wall),
  closingWallId: Id.nullable(),
  closingLength: Dimension,
});
export type Outline = z.infer<typeof Outline>;

/** Where a tap placed the feature; used for drawing until the real dimensions are measured. */
const WallSketch = z.object({ offset: LengthUm, width: LengthUm.positive() });

const OnWall = {
  id: Id,
  wallId: Id,
  /** Which end of the wall `offset` is measured from: whichever corner was nearer when placed. */
  from: z.enum(['start', 'end']).optional(),
  offset: Dimension,
  width: Dimension,
  sketch: WallSketch,
};

export const Feature = z.discriminatedUnion('kind', [
  z.object({ ...OnWall, kind: z.literal('door'), height: Dimension.optional() }),
  z.object({ ...OnWall, kind: z.literal('window'), sill: Dimension.optional(), height: Dimension.optional() }),
  z.object({ ...OnWall, kind: z.literal('opening') }),
  z.object({
    ...OnWall,
    kind: z.literal('step'),
    rise: Dimension.optional(),
    run: Dimension.optional(),
    count: z.number().int().positive().max(50).optional(),
  }),
  z.object({
    id: Id,
    kind: z.literal('post'),
    /** The corner is identified by the wall that starts there, never by index. */
    cornerWallId: Id,
    /** Distance along that wall from the corner. */
    dx: Dimension,
    /** Distance out from that wall, measured perpendicular to it. */
    dy: Dimension,
    size: Dimension.optional(),
    /** Tap position in the same frame; `dy` is signed (left of the wall is positive). */
    sketch: z.object({ dx: z.number().int(), dy: z.number().int() }),
  }),
]);
export type Feature = z.infer<typeof Feature>;
export type FeatureKind = Feature['kind'];
export type WallFeature = Exclude<Feature, { kind: 'post' }>;

export const isWallFeature = (f: Feature): f is WallFeature => f.kind !== 'post';

/** Dimension fields each feature kind may carry, in measuring order (drives auto-advance). */
export const FEATURE_FIELDS = {
  door: ['offset', 'width', 'height'],
  window: ['offset', 'width', 'sill', 'height'],
  opening: ['offset', 'width'],
  step: ['offset', 'width', 'rise', 'run'],
  post: ['dx', 'dy', 'size'],
} as const satisfies Record<FeatureKind, readonly string[]>;

/** Fields measured with calipers by default (fine detail rather than tape lengths). */
export const DETAIL_FIELDS: ReadonlySet<string> = new Set(['size']);

export interface Layout {
  name: string;
  kind: LayoutKind;
  /** Deleted from the field. Soft: the layout and its history stay, and the delete can be undone. */
  archived?: boolean;
  outline: Outline;
  features: Record<string, Feature>;
}

/** One document per layout; `null` until `layout.create` is applied. */
export type LayoutDoc = Layout | null;

/** Addresses one measurable slot by stable id. */
export const DimensionTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('wall'), wallId: Id }),
  z.object({ kind: z.literal('closing') }),
  z.object({ kind: z.literal('feature'), featureId: Id, field: z.string().min(1).max(16) }),
]);
export type DimensionTarget = z.infer<typeof DimensionTarget>;
