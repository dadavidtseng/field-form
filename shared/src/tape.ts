import type { MeasurementSource as SourceKind } from './model';
import { inches, type Um } from './units';

// Measurement input. The UI depends only on `ReadingSource`, so a real Bluetooth tape
// (which needs a development build, not Expo Go) can replace the simulator without UI changes.

export interface Reading {
  value: Um;
  source: Exclude<SourceKind, 'manual'>;
  device: string;
  at: number;
}

export interface ReadingSource {
  readonly device: string;
  onReading(listener: (r: Reading) => void): () => void;
}

/** Small, fast, seedable PRNG (mulberry32): the same seed always yields the same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Error is whole 32nds of an inch, at most 4 (1/8"). Counted in 32nds, converted once, so it never drifts. */
const MAX_ERROR_32NDS = 4;

/**
 * Stands in for the button on a Bluetooth tape. `press(value)` emits that reading, optionally
 * with up to ±1/8" of error. The error is seeded, so a demo or test replays identically.
 */
export class SimulatedTape implements ReadingSource {
  readonly device = 'Simulated tape';
  private readonly listeners = new Set<(r: Reading) => void>();
  private random: () => number;

  constructor(
    private readonly seed = 42,
    private readonly now: () => number = Date.now,
  ) {
    this.random = mulberry32(seed);
  }

  onReading(listener: (r: Reading) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  press(value: Um, realisticError = false): Reading {
    let v = value;
    if (realisticError) {
      const thirtySeconds = Math.round((this.random() * 2 - 1) * MAX_ERROR_32NDS);
      v = Math.max(0, value + inches(thirtySeconds / 32));
    }
    const reading: Reading = { value: v, source: 'tape', device: this.device, at: this.now() };
    for (const l of this.listeners) l(reading);
    return reading;
  }

  /** Restart the error sequence, e.g. before recording a demo. */
  reset(): void {
    this.random = mulberry32(this.seed);
  }
}
