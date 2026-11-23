import { EMPTY, feet, type Op } from '@field-form/shared';
import { randomUUID } from 'expo-crypto';

/**
 * Temporary: a 12' × 10' room with a door, a window and a post, sent as one batch, so the
 * canvas and sync can be checked before sketch mode exists. Delete with sketch mode.
 */
export function sampleRoomOp(): Op {
  const [w1, w2, w3, wc] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const wall = (id: string, turnDeg: number, ft: number) => ({ id, turnDeg, length: EMPTY, sketchUm: feet(ft) });
  return {
    t: 'batch',
    ops: [
      { t: 'wall.add', wall: wall(w1, 0, 12) },
      { t: 'wall.add', wall: wall(w2, 90, 10) },
      { t: 'wall.add', wall: wall(w3, 90, 12) },
      { t: 'outline.close', closingWallId: wc },
      {
        t: 'feature.add',
        feature: {
          id: randomUUID(),
          kind: 'door',
          wallId: w1,
          offset: EMPTY,
          width: EMPTY,
          sketch: { offset: feet(2), width: feet(3) },
        },
      },
      {
        t: 'feature.add',
        feature: {
          id: randomUUID(),
          kind: 'window',
          wallId: w2,
          offset: EMPTY,
          width: EMPTY,
          sketch: { offset: feet(3), width: feet(4) },
        },
      },
      {
        t: 'feature.add',
        feature: {
          id: randomUUID(),
          kind: 'post',
          cornerWallId: w3,
          dx: EMPTY,
          dy: EMPTY,
          sketch: { dx: feet(3), dy: feet(2) },
        },
      },
    ],
  };
}
