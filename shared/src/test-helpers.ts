// Builders shared by the unit tests. Not exported from the package index.
import { EMPTY, type Feature, type LayoutDoc, type Wall } from './model';
import { applyOp, type Op } from './ops';
import { feet, type Um } from './units';

export const wall = (id: string, turnDeg: number, sketchUm: Um, measured?: Um): Wall => ({
  id,
  turnDeg,
  sketchUm,
  length: measured === undefined ? EMPTY : { value: measured, source: 'tape' },
});

export const door = (id: string, wallId: string, offset: Um, width: Um): Feature => ({
  id,
  kind: 'door',
  wallId,
  offset: EMPTY,
  width: EMPTY,
  sketch: { offset, width },
});

export const run = (ops: Op[], start: LayoutDoc = null): LayoutDoc => ops.reduce(applyOp, start);

/** A 12' × 10' room drawn counter-clockwise from the origin and closed. */
export const room12x10 = (): LayoutDoc =>
  run([
    { t: 'layout.create', name: 'Kitchen', kind: 'room' },
    { t: 'wall.add', wall: wall('w1', 0, feet(12)) },
    { t: 'wall.add', wall: wall('w2', 90, feet(10)) },
    { t: 'wall.add', wall: wall('w3', 90, feet(12)) },
    { t: 'outline.close', closingWallId: 'wc' },
  ]);
