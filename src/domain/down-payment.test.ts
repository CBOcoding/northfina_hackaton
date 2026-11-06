import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import {
  bandHint,
  clampDownPayment,
  downPaymentStepCents,
  maxDownPaymentCents,
  suggestedDownPayments,
} from './down-payment';
import { quoteLease } from './pricing';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

describe('downPaymentStepCents', () => {
  it('grows with the price', () => {
    expect(downPaymentStepCents(389_000)).toBe(5_000); // 3 890 € → 50 €
    expect(downPaymentStepCents(499_999)).toBe(5_000);
    expect(downPaymentStepCents(500_000)).toBe(10_000); // 5 000 € → 100 €
    expect(downPaymentStepCents(2_000_000)).toBe(10_000); // 20 000 € → 100 €
    expect(downPaymentStepCents(2_000_001)).toBe(50_000);
    expect(downPaymentStepCents(14_500_000)).toBe(50_000); // 145 000 € → 500 €
  });
});

describe('maxDownPaymentCents', () => {
  it('is half the price, rounded down to a whole step', () => {
    expect(maxDownPaymentCents(table, 389_000)).toBe(190_000); // 1 945 € → 1 900 €
    expect(maxDownPaymentCents(table, 119_900)).toBe(55_000); // 599,50 € → 550 €
    expect(maxDownPaymentCents(table, 14_500_000)).toBe(7_250_000);
  });

  it('keeps at least the minimum financed amount', () => {
    expect(maxDownPaymentCents(table, 50_000)).toBe(20_000); // 500 € item: 200 € down, 300 € financed
  });

  it('is 0 for an item below the minimum financed amount', () => {
    expect(maxDownPaymentCents(table, 28_900)).toBe(0); // ebike-010, 289 €
  });
});

describe('suggestedDownPayments', () => {
  it('suggests 250 / 500 / 750 / 1 000 € on small items', () => {
    expect(suggestedDownPayments(table, 389_000)).toEqual([0, 25_000, 50_000, 75_000, 100_000]);
  });

  it('hides amounts above the maximum', () => {
    expect(suggestedDownPayments(table, 119_900)).toEqual([0, 25_000, 50_000]);
    expect(suggestedDownPayments(table, 28_900)).toEqual([0]);
  });

  it('offers card 7: 20 000 € down on the 145 000 € tractor', () => {
    expect(suggestedDownPayments(table, 14_500_000)).toContain(2_000_000);
  });
});

describe('clampDownPayment', () => {
  it('keeps whole euros between 0 and the maximum', () => {
    expect(clampDownPayment(table, 389_000, 123_456)).toBe(123_400);
    expect(clampDownPayment(table, 389_000, 999_999)).toBe(190_000);
    expect(clampDownPayment(table, 389_000, -5)).toBe(0);
    expect(clampDownPayment(table, 389_000, Number.NaN)).toBe(0);
  });
});

describe('bandHint', () => {
  it('warns before a down payment moves the e-bike from band B to band A', () => {
    expect(bandHint(table, 389_000, 0)).toEqual({
      kind: 'crosses',
      fromCents: 189_100, // 1 891 € down leaves 1 999 € financed: band A
      band: 'A',
      annualInterestPercent: 9.9,
      currentBand: 'B',
      currentInterestPercent: 7.9,
    });
  });

  it('explains it once the down payment has moved the band', () => {
    expect(bandHint(table, 389_000, 190_000)).toEqual({
      kind: 'moved',
      band: 'A',
      annualInterestPercent: 9.9,
      originalBand: 'B',
      originalInterestPercent: 7.9,
      keepUpToCents: 189_000,
    });
  });

  it('says nothing when the next band is out of reach', () => {
    expect(bandHint(table, 14_500_000, 2_000_000)).toBeNull(); // card 7 stays in band D
    expect(bandHint(table, 119_900, 0)).toBeNull(); // band A has no lower band
  });

  it('keepUpToCents really keeps the band, one euro more does not', () => {
    const hint = bandHint(table, 389_000, 190_000);
    if (hint?.kind !== 'moved') throw new Error('expected moved');
    const keep = quoteLease(table, {
      listPriceCents: 389_000,
      downPaymentCents: hint.keepUpToCents,
      termMonths: 36,
    });
    const over = quoteLease(table, {
      listPriceCents: 389_000,
      downPaymentCents: hint.keepUpToCents + 100,
      termMonths: 36,
    });
    expect(keep.ok && keep.quote.band).toBe('B');
    expect(over.ok && over.quote.band).toBe('A');
  });
});

describe('down payment choices: properties', () => {
  it('every offered amount is a whole euro, within the maximum and can be priced', () => {
    fc.assert(
      fc.property(fc.integer({ min: 30_000, max: 25_000_000 }), (listPriceCents) => {
        const max = maxDownPaymentCents(table, listPriceCents);
        expect(max % downPaymentStepCents(listPriceCents)).toBe(0);
        expect(max * 2).toBeLessThanOrEqual(listPriceCents);
        for (const down of [...suggestedDownPayments(table, listPriceCents), max]) {
          expect(down % 100).toBe(0);
          expect(down).toBeLessThanOrEqual(max);
          const result = quoteLease(table, {
            listPriceCents,
            downPaymentCents: down,
            termMonths: 36,
          });
          expect(result.ok).toBe(true);
        }
      }),
      { numRuns: 500 }
    );
  });
});
