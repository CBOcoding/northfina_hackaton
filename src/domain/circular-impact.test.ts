import { beforeAll, describe, expect, it } from 'vitest';
import { loadCo2Factors } from '@/data/load';
import type { Co2Factors } from '@/data/schemas';
import { circularImpact } from './circular-impact';

let factors: Co2Factors;
beforeAll(async () => {
  factors = await loadCo2Factors();
});

describe('circularImpact', () => {
  it('card 10: ebike-008, two lives lived, a third one coming', () => {
    const impact = circularImpact(factors, {
      category: 'e_bike',
      previousLives: 2,
      nextLife: { valueAfterCents: 34_232, listPriceCents: 188_900 },
    });
    expect(impact.lives).toEqual([
      { life: 1, avoidedGrams: 0, method: 'new_item' },
      // 165 kg × (1 − 0.12): no record of that life, so the data hint
      { life: 2, avoidedGrams: 145_200, method: 'data_hint' },
      // 165 kg × 34 232 / 188 900 = 29.901 kg of life left, minus 19.8 kg to refurbish
      { life: 3, avoidedGrams: 10_101, method: 'wear_adjusted' },
    ]);
    expect(impact.savedSoFarGrams).toBe(145_200);
    expect(impact.savedWithNextGrams).toBe(155_301);
  });

  it('an almost worn-out item saves nothing, never a negative amount', () => {
    const impact = circularImpact(factors, {
      category: 'laptop',
      previousLives: 1,
      nextLife: { valueAfterCents: 1_000, listPriceCents: 100_000 },
    });
    expect(impact.lives.at(-1)).toEqual({ life: 2, avoidedGrams: 0, method: 'wear_adjusted' });
  });

  it('a value above the list price counts as a whole new item, no more', () => {
    const impact = circularImpact(factors, {
      category: 'farm_machine',
      previousLives: 1,
      nextLife: { valueAfterCents: 20_000_000, listPriceCents: 10_000_000 },
    });
    // 18 000 kg − 12 % = 15 840 kg
    expect(impact.lives.at(-1)?.avoidedGrams).toBe(15_840_000);
  });

  it('the first lease of a new item avoids nothing', () => {
    const impact = circularImpact(factors, {
      category: 'e_bike',
      previousLives: 0,
      nextLife: { valueAfterCents: 100_000, listPriceCents: 100_000 },
    });
    expect(impact).toEqual({
      lives: [{ life: 1, avoidedGrams: 0, method: 'new_item' }],
      savedSoFarGrams: 0,
      savedWithNextGrams: 0,
    });
  });

  it('without a coming life it counts only the past', () => {
    const impact = circularImpact(factors, {
      category: 'e_bike',
      previousLives: 3,
      nextLife: null,
    });
    expect(impact.lives).toHaveLength(3);
    expect(impact.savedWithNextGrams).toBe(2 * 145_200);
  });

  it('throws on a negative or fractional number of lives', () => {
    const input = { category: 'e_bike' as const, nextLife: null };
    expect(() => circularImpact(factors, { ...input, previousLives: -1 })).toThrow(RangeError);
    expect(() => circularImpact(factors, { ...input, previousLives: 1.5 })).toThrow(RangeError);
  });
});
