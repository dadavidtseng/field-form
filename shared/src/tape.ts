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

/**
 * Stands in for the button on a Bluetooth tape. `press(value)` emits that reading, optionally
 * with up to ±1/8" of error. The error is seeded, so a demo or test replays identically.
 */
/** What differs between simulated devices: how they label readings and how fine their error is. */
interface DeviceSpec {
  source: Reading['source'];
  device: string;
  /** Largest error, in whole steps. */
  maxErrorSteps: number;
  /** Converts a whole number of error steps to µm (counted in steps first, so it never drifts). */
  stepsToUm: (steps: number) => Um;
  /** The device's display resolution: readings are rounded to it. */
  resolutionUm: Um;
}

const TAPE: DeviceSpec = {
  source: 'tape',
  device: 'Simulated tape',
  maxErrorSteps: 4, // ±1/8" in 32nds
  stepsToUm: (n) => inches(n / 32),
  resolutionUm: 1,
};

const CALIPER: DeviceSpec = {
  source: 'caliper',
  device: 'Simulated caliper',
  maxErrorSteps: 5, // ±0.05 mm in hundredths
  stepsToUm: (n) => n * 10,
  resolutionUm: 10, // 0.01 mm
};

/**
 * Stands in for a Bluetooth measuring tool's button. `press(value)` emits that reading, optionally
 * with a small error. The error is seeded, so a demo or test replays identically.
 */
export class SimulatedDevice implements ReadingSource {
  readonly device: string;
  private readonly listeners = new Set<(r: Reading) => void>();
  private random: () => number;

  constructor(
    private readonly spec: DeviceSpec,
    private readonly seed = 42,
    private readonly now: () => number = Date.now,
  ) {
    this.device = spec.device;
    this.random = mulberry32(seed);
  }

  onReading(listener: (r: Reading) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  press(value: Um, realisticError = false): Reading {
    let v = Math.round(value / this.spec.resolutionUm) * this.spec.resolutionUm;
    if (realisticError) {
      const steps = Math.round((this.random() * 2 - 1) * this.spec.maxErrorSteps);
      v = Math.max(0, v + this.spec.stepsToUm(steps));
    }
    const reading: Reading = { value: v, source: this.spec.source, device: this.device, at: this.now() };
    for (const l of this.listeners) l(reading);
    return reading;
  }

  /** Restart the error sequence, e.g. before recording a demo. */
  reset(): void {
    this.random = mulberry32(this.seed);
  }
}

/** A tape measure: up to ±1/8" of error. */
export class SimulatedTape extends SimulatedDevice {
  constructor(seed = 42, now: () => number = Date.now) {
    super(TAPE, seed, now);
  }
}

/** Calipers for fine detail: 0.01 mm resolution, up to ±0.05 mm of error. */
export class SimulatedCaliper extends SimulatedDevice {
  constructor(seed = 7, now: () => number = Date.now) {
    super(CALIPER, seed, now);
  }
}
