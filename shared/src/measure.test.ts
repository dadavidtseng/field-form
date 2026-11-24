import { describe, expect, it } from 'vitest';
import type { Layout } from './model';
import { applyOp } from './ops';
import { closureCheck, closureLevel, layoutSummary, measureSlots, nextUnmeasured } from './measure';
import { SimulatedCaliper, SimulatedTape } from './tape';
import { room12x10 } from './test-helpers';
import { feet, inches, mm } from './units';

const measure = (doc: Layout, wallId: string | null, value: number): Layout =>
  applyOp(doc, {
    t: 'dimension.set',
    target: wallId ? { kind: 'wall', wallId } : { kind: 'closing' },
    dim: { value, source: 'tape' },
  }) as Layout;

describe('measuring order', () => {
  it('walks the drawn walls, then the closing wall', () => {
    const slots = measureSlots(room12x10()!);
    expect(slots.map((s) => s.label)).toEqual([
      'Wall 1 of 4',
      'Wall 2 of 4',
      'Wall 3 of 4',
      'Last wall · back to start (4 of 4)',
    ]);
    expect(slots[3]!.estimateUm).toBe(feet(10));
  });

  it('auto-advances to the next empty slot and wraps round', () => {
    let doc = measure(room12x10()!, 'w1', feet(12));
    expect(nextUnmeasured(measureSlots(doc), 'wall:w1')!.key).toBe('wall:w2');
    doc = measure(measure(doc, 'w2', feet(10)), 'w3', feet(12));
    expect(nextUnmeasured(measureSlots(doc), 'wall:w3')!.key).toBe('closing');
    doc = measure(doc, null, feet(10));
    expect(nextUnmeasured(measureSlots(doc), 'closing')).toBeNull();
  });

  it('skips already-measured slots when wrapping', () => {
    const doc = measure(room12x10()!, 'w2', feet(10));
    expect(nextUnmeasured(measureSlots(doc), 'closing')!.key).toBe('wall:w1');
    expect(nextUnmeasured(measureSlots(doc), 'wall:w1')!.key).toBe('wall:w3');
  });
});

describe('closure check', () => {
  it.each([
    [inches(0.125), 'ok'],
    [-inches(0.5), 'warn'],
    [inches(2), 'bad'],
  ] as const)('%i µm → %s', (err, level) => expect(closureLevel(err)).toBe(level));

  it('is only judged once the closing wall is measured', () => {
    const doc = room12x10()!;
    expect(closureCheck(doc)).toBeNull();
    expect(closureCheck(measure(doc, null, feet(10) + inches(0.5)))).toEqual({ errorUm: inches(0.5), level: 'warn' });
  });
});

describe('layout summary', () => {
  it('gives perimeter, area, progress, and keeps provenance on slots', () => {
    const doc = measure(room12x10()!, 'w1', feet(12));
    const s = layoutSummary(doc);
    expect(s.perimeterUm).toBe(feet(44));
    expect(s.areaSqFt).toBeCloseTo(120, 3);
    expect(s).toMatchObject({ measured: 1, total: 4, closure: null });
    expect(measureSlots(doc)[0]!.dim).toMatchObject({ value: feet(12), source: 'tape' });
  });

  it('an open line has a length but no area', () => {
    const doc = applyOp(room12x10()!, { t: 'outline.open' }) as Layout;
    expect(layoutSummary(doc).areaSqFt).toBeNull();
    expect(layoutSummary(doc).perimeterUm).toBe(feet(34));
  });
});

describe('simulated tape', () => {
  it('without error, reads exactly the requested value', () => {
    expect(new SimulatedTape().press(feet(12)).value).toBe(feet(12));
  });

  it('with error, the same seed replays the same readings, within ±1/8"', () => {
    const run = () => {
      const tape = new SimulatedTape(7, () => 0);
      return [1, 2, 3, 4, 5].map(() => tape.press(feet(10), true).value);
    };
    const a = run();
    expect(run()).toEqual(a);
    for (const v of a) expect(Math.abs(v - feet(10))).toBeLessThanOrEqual(inches(1 / 8));
    expect(new Set(a).size).toBeGreaterThan(1);
  });

  it('calipers read to 0.01 mm, within ±0.05 mm, labelled as caliper', () => {
    const caliper = new SimulatedCaliper(3, () => 0);
    const readings = [1, 2, 3, 4, 5].map(() => caliper.press(mm(89.123), true));
    for (const r of readings) {
      expect(r.source).toBe('caliper');
      expect(r.value % 10).toBe(0);
      expect(Math.abs(r.value - mm(89.12))).toBeLessThanOrEqual(50);
    }
  });

  it('notifies listeners', () => {
    const tape = new SimulatedTape();
    const got: number[] = [];
    const off = tape.onReading((r) => got.push(r.value));
    tape.press(100);
    off();
    tape.press(200);
    expect(got).toEqual([100]);
  });
});

describe('ready to quote', () => {
  // Every wall of the 12' × 10' room measured, the closing wall within `closingOff` of computed.
  const measuredRoom = (closingOff = 0) => {
    let doc = room12x10() as Layout;
    doc = measure(doc, 'w1', feet(12));
    doc = measure(doc, 'w2', feet(10));
    doc = measure(doc, 'w3', feet(12));
    return measure(doc, null, feet(10) + closingOff);
  };

  it('is ready when everything is measured and the shape closes', () => {
    expect(layoutSummary(measuredRoom()).readyToQuote).toBe(true);
    expect(layoutSummary(measuredRoom(inches(0.5))).readyToQuote).toBe(true); // amber: a second look, not a block
  });

  it('is not ready when the shape is more than an inch off', () => {
    expect(layoutSummary(measuredRoom(inches(2))).readyToQuote).toBe(false);
  });

  it('is not ready when a measured door no longer fits its wall', () => {
    const doc = applyOp(measuredRoom(), {
      t: 'feature.add',
      feature: {
        id: 'd1',
        kind: 'door',
        wallId: 'w1',
        offset: { value: feet(10), source: 'tape' },
        width: { value: feet(3), source: 'tape' },
        sketch: { offset: feet(10), width: feet(3) },
      },
    }) as Layout;
    const s = layoutSummary(doc);
    expect(s.misfitIds).toEqual(['d1']);
    expect(s.readyToQuote).toBe(false);
  });

  it('an empty space is never ready', () => {
    expect(layoutSummary(applyOp(null, { t: 'layout.create', name: 'X', kind: 'room' }) as Layout).readyToQuote).toBe(
      false,
    );
  });
});
