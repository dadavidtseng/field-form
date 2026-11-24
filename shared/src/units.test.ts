import { describe, expect, it } from 'vitest';
import { feet, formatArea, formatFeetInches, formatLength, inches, mm, parseLength } from './units';

describe('formatFeetInches', () => {
  it.each([
    [feet(12) + inches(4.375), `12' 4-3/8"`],
    [feet(9), `9' 0"`],
    [inches(4.5), `4-1/2"`],
    [inches(0.375), `3/8"`],
    [0, `0"`],
    [inches(11 + 63 / 64), `1' 0"`], // carry into feet
    [-inches(0.5), `-1/2"`],
  ])('%i µm → %s', (um, text) => expect(formatFeetInches(um)).toBe(text));

  it('reduces fractions', () => expect(formatFeetInches(inches(2.5))).toBe(`2-1/2"`));
  it('uses 1/32 for detail values', () => expect(formatLength(inches(1 / 32), 'imperial', true)).toBe(`1/32"`));
  it('formats metric', () => {
    expect(formatLength(mm(3760), 'metric')).toBe('3760 mm');
    expect(formatLength(mm(12.345), 'metric', true)).toBe('12.35 mm');
  });
});

describe('formatArea', () => {
  it('square feet and square metres', () => {
    const tenByTwelveFt = feet(10) * feet(12);
    expect(formatArea(tenByTwelveFt)).toBe('120.0 sq ft');
    expect(formatArea(tenByTwelveFt, 'metric')).toBe('11.15 m²');
  });
});

describe('parseLength', () => {
  it.each([
    [`12' 4-3/8"`, feet(12) + inches(4.375)],
    [`12'4 3/8`, feet(12) + inches(4.375)],
    [`12 ft 4 in`, feet(12) + inches(4)],
    [`4-3/8"`, inches(4.375)],
    [`3/8"`, inches(0.375)],
    [`12.5'`, feet(12.5)],
    [`150.5"`, inches(150.5)],
    [`12'`, feet(12)],
    [`12`, inches(12)],
    [`3760 mm`, mm(3760)],
    [`376 cm`, mm(3760)],
    [`3.76 m`, mm(3760)],
    [`12’ 4”`, feet(12) + inches(4)], // smart quotes from a pasted plan
  ])('%s', (text, um) => expect(parseLength(text)).toBe(um));

  it('bare numbers follow the default unit', () => expect(parseLength('25.4', 'mm')).toBe(mm(25.4)));

  it.each(['', 'abc', `4/0"`, `12' x`, '--'])('rejects %j', (text) => expect(parseLength(text)).toBeNull());

  it('round-trips every 1/16" up to 2 ft', () => {
    for (let ticks = 0; ticks <= 24 * 16; ticks++) {
      const um = inches(ticks / 16);
      expect(parseLength(formatFeetInches(um))).toBe(um);
    }
  });
});
