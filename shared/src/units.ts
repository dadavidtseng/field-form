/**
 * ---------------------------------------------------------------------------------------------------
 * units.ts
 *
 * Lengths are stored as integer micrometres (1 in = 25 400 µm exactly), so unit
 * conversion and rounding only ever happen at the display edge, never in stored data.
 *
 * @module shared/src
 * ---------------------------------------------------------------------------------------------------
 */

export type Um = number;

export const UM_PER_INCH = 25_400;
export const UM_PER_FOOT = 12 * UM_PER_INCH;
export const UM_PER_MM = 1_000;

export type UnitSystem = 'imperial' | 'metric';

export const inches = (n: number): Um => Math.round(n * UM_PER_INCH);
export const feet = (n: number): Um => Math.round(n * UM_PER_FOOT);
export const mm = (n: number): Um => Math.round(n * UM_PER_MM);

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * `12' 4-3/8"` style, rounded to the nearest 1/denominator inch with carry
 * (11-63/64" at 1/16 becomes 1' 0"). Under a foot the feet part is omitted.
 */
export function formatFeetInches(um: Um, denominator = 16): string {
  const sign = um < 0 ? '-' : '';
  const ticks = Math.round((Math.abs(um) * denominator) / UM_PER_INCH);
  const perFoot = 12 * denominator;
  const ft = Math.floor(ticks / perFoot);
  const rem = ticks % perFoot;
  const whole = Math.floor(rem / denominator);
  let num = rem % denominator;
  let den = denominator;
  if (num) {
    const g = gcd(num, den);
    num /= g;
    den /= g;
  }
  const inchPart = num ? (whole ? `${whole}-${num}/${den}` : `${num}/${den}`) : `${whole}`;
  return ft ? `${sign}${ft}' ${inchPart}"` : `${sign}${inchPart}"`;
}

export function formatMillimetres(um: Um, decimals = 0): string {
  return `${(um / UM_PER_MM).toFixed(decimals)} mm`;
}

/** Tape lengths round to 1/16" or 1 mm; caliper ("detail") values to 1/32" or 0.01 mm. */
export function formatLength(um: Um, system: UnitSystem = 'imperial', detail = false): string {
  return system === 'imperial' ? formatFeetInches(um, detail ? 32 : 16) : formatMillimetres(um, detail ? 2 : 0);
}

const METRIC = /^(\d+(?:\.\d+)?)\s*(mm|cm|m)$/;
const FEET = /^(?:(\d+(?:\.\d+)?)\s*(?:'|ft)\s*)?(.*)$/;
// Either `W`, `W-N/D` / `W N/D` (separator required), or a bare `N/D`.
const INCHES = /^(?:(\d+(?:\.\d+)?)(?:[\s-]+(\d+)\/(\d+))?|(\d+)\/(\d+))?$/;

/**
 * Parses what a person types or reads off a plan: `12' 4-3/8"`, `12'4 3/8`, `4-3/8"`,
 * `3/8"`, `12.5'`, `150.5"`, `3760 mm`, `376 cm`, `3.76 m`. A bare number uses
 * `defaultUnit`. Returns null for anything it cannot read unambiguously.
 */
export function parseLength(input: string, defaultUnit: 'in' | 'mm' = 'in'): Um | null {
  const s = input.trim().toLowerCase().replace(/[″”“]/g, '"').replace(/[′’‘]/g, "'").replace(/\s+/g, ' ');
  if (!s) return null;

  const metric = METRIC.exec(s);
  if (metric) {
    const factor = { mm: 1, cm: 10, m: 1000 }[metric[2] as 'mm' | 'cm' | 'm'];
    return mm(Number(metric[1]) * factor);
  }

  const feetMatch = FEET.exec(s);
  if (!feetMatch) return null;
  const ft = feetMatch[1] ? Number(feetMatch[1]) : 0;
  const hadInchMark = /("|in)$/.test(feetMatch[2] ?? '');
  const rest = (feetMatch[2] ?? '').replace(/("|in)$/, '').trim();
  if (!feetMatch[1] && !rest) return null;

  const inchMatch = INCHES.exec(rest);
  if (!inchMatch) return null;
  const wholeStr = inchMatch[1];
  const numStr = inchMatch[2] ?? inchMatch[4];
  const denStr = inchMatch[3] ?? inchMatch[5];
  if (!feetMatch[1] && !wholeStr && !numStr) return null;
  if (numStr && Number(denStr) === 0) return null;
  const inch = (wholeStr ? Number(wholeStr) : 0) + (numStr ? Number(numStr) / Number(denStr) : 0);

  const bareNumber = !feetMatch[1] && !hadInchMark && !numStr;
  if (bareNumber && defaultUnit === 'mm') return mm(inch);
  return inches(ft * 12 + inch);
}
