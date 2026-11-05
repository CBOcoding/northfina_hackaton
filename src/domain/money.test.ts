import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  applyFactorMicro,
  factorToMicro,
  formatEuro,
  percentToBasisPoints,
  roundHalfUp,
  roundHalfUpBig,
} from './money';

// Intl uses no-break spaces; compare with plain spaces so the tests are readable.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatEuro', () => {
  it('formats Finnish style: space as thousands separator, comma decimals, € after', () => {
    expect(plain(formatEuro(189_900, 'fi'))).toBe('1 899,00 €');
    expect(plain(formatEuro(25_000_000, 'fi-FI'))).toBe('250 000,00 €');
  });

  it('formats English style: € first, comma thousands, dot decimals', () => {
    expect(formatEuro(189_900, 'en')).toBe('€1,899.00');
    expect(formatEuro(28_900, 'en-GB')).toBe('€289.00');
  });

  it('shows single cents and zero correctly', () => {
    expect(plain(formatEuro(5, 'fi'))).toBe('0,05 €');
    expect(formatEuro(0, 'en')).toBe('€0.00');
  });

  it('formats negative amounts such as credit notes', () => {
    expect(formatEuro(-1_250, 'en')).toBe('-€12.50');
  });

  it('throws on fractions of a cent', () => {
    expect(() => formatEuro(10.5, 'en')).toThrow(RangeError);
  });
});

describe('roundHalfUp', () => {
  it('rounds below half down and half or more up', () => {
    expect(roundHalfUp(10_730_176, 1_000)).toBe(10_730); // 10730.176
    expect(roundHalfUp(2_736_150, 1_000)).toBe(2_736); // 2736.15
    expect(roundHalfUp(5, 10)).toBe(1); // exactly 0.5
    expect(roundHalfUp(4, 10)).toBe(0);
  });

  it('keeps exact results and zero', () => {
    expect(roundHalfUp(100, 10)).toBe(10);
    expect(roundHalfUp(0, 7)).toBe(0);
  });

  it('throws on negative, fractional or unsafe input', () => {
    expect(() => roundHalfUp(-1, 10)).toThrow(RangeError);
    expect(() => roundHalfUp(1.5, 10)).toThrow(RangeError);
    expect(() => roundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.MAX_SAFE_INTEGER + 2, 1)).toThrow(RangeError);
  });
});

describe('factorToMicro', () => {
  it('turns 6-decimal factors into exact integers', () => {
    expect(factorToMicro(0.027584)).toBe(27_584);
    expect(factorToMicro(0.056022)).toBe(56_022);
    expect(factorToMicro(0.021763)).toBe(21_763);
  });

  it('refuses factors that would lose precision', () => {
    expect(() => factorToMicro(0.0275845)).toThrow(RangeError);
    expect(() => factorToMicro(-0.01)).toThrow(RangeError);
  });
});

describe('applyFactorMicro', () => {
  it('matches the worked example in data/DATA.md: 389000 × 0.027584 → 10730', () => {
    expect(applyFactorMicro(389_000, 27_584)).toBe(10_730);
  });

  it('rounds an exact half cent up: 12 500 000 × 0.021763 = 272037.5 → 272038', () => {
    expect(applyFactorMicro(12_500_000, 21_763)).toBe(272_038);
  });

  it('throws on fractions of a cent', () => {
    expect(() => applyFactorMicro(10.5, 27_584)).toThrow(RangeError);
  });
});

describe('basis points', () => {
  it('converts percents with up to 2 decimals', () => {
    expect(percentToBasisPoints(25.5)).toBe(2_550);
    expect(percentToBasisPoints(26)).toBe(2_600);
    expect(percentToBasisPoints(0)).toBe(0);
    expect(() => percentToBasisPoints(25.555)).toThrow(RangeError);
    expect(() => percentToBasisPoints(-1)).toThrow(RangeError);
  });

  it('applies VAT like the worked example: 10730 at 25.5 % → 2736', () => {
    expect(applyBasisPoints(10_730, 2_550)).toBe(2_736);
    expect(applyBasisPoints(10_730, 2_600)).toBe(2_790); // 2789.8
  });

  it('throws on negative cents', () => {
    expect(() => applyBasisPoints(-1, 2_550)).toThrow(RangeError);
  });
});

describe('roundHalfUpBig', () => {
  it('rounds big exact fractions half up', () => {
    expect(roundHalfUpBig(5n, 10n)).toBe(1);
    expect(roundHalfUpBig(4n, 10n)).toBe(0);
    expect(roundHalfUpBig(10n ** 30n * 7n + 5n * 10n ** 29n, 10n ** 30n)).toBe(8);
  });

  it('throws on negative input, zero denominator and unsafe results', () => {
    expect(() => roundHalfUpBig(-1n, 10n)).toThrow(RangeError);
    expect(() => roundHalfUpBig(1n, 0n)).toThrow(RangeError);
    expect(() => roundHalfUpBig(10n ** 20n, 1n)).toThrow(RangeError);
  });
});
