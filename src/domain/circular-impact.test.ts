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
      listPriceCents: 188_900,
      recorded: [],
      nextValueCents: 34_232,
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

  it('card 10 after signing: life 3 recorded at 34 232 counts as lived, with no next life', () => {
    const impact = circularImpact(factors, {
      category: 'e_bike',
      previousLives: 2,
      listPriceCents: 188_900,
      recorded: [{ life: 3, valueCents: 34_232 }],
      nextValueCents: null,
    });
    expect(impact.lives.at(-1)).toEqual({ life: 3, avoidedGrams: 10_101, method: 'wear_adjusted' });
    expect(impact.savedSoFarGrams).toBe(145_200 + 10_101);
    expect(impact.savedWithNextGrams).toBe(145_200 + 10_101);
  });

  it('a recorded life is wear-adjusted, a recorded first life avoids nothing, the next follows them', () => {
    const impact = circularImpact(factors, {
      category: 'e_bike',
      previousLives: 1,
      listPriceCents: 188_900,
      recorded: [
        { life: 1, valueCents: 188_900 },
        { life: 2, valueCents: 188_900 },
      ],
      nextValueCents: 34_232,
    });
    expect(impact.lives).toEqual([
      { life: 1, avoidedGrams: 0, method: 'new_item' },
      { life: 2, avoidedGrams: 145_200, method: 'wear_adjusted' }, // full value: 165 kg − 19.8 kg
      { life: 3, avoidedGrams: 10_101, method: 'wear_adjusted' },
    ]);
    expect(impact.savedSoFarGrams).toBe(145_200);
    expect(impact.savedWithNextGrams).toBe(155_301);
  });

  it('without a list price nothing can be measured: data hint for the past, no next life', () => {
    const impact = circularImpact(factors, {
      category: 'e_bike',
      previousLives: 1,
      listPriceCents: 0,
      recorded: [{ life: 2, valueCents: 34_232 }],
      nextValueCents: 34_232,
    });
    expect(impact.lives.map((l) => l.method)).toEqual(['new_item', 'data_hint']);
    expect(impact.savedWithNextGrams).toBe(impact.savedSoFarGrams);
  });

  it('an almost worn-out item saves nothing, never a negative amount', () => {
    const impact = circularImpact(factors, {
      category: 'laptop',
      previousLives: 1,
      listPriceCents: 100_000,
      recorded: [],
      nextValueCents: 1_000,
    });
    expect(impact.lives.at(-1)).toEqual({ life: 2, avoidedGrams: 0, method: 'wear_adjusted' });
  });

  it('a value above the list price counts as a whole new item, no more', () => {
    const impact = circularImpact(factors, {
      category: 'farm_machine',
      previousLives: 1,
      listPriceCents: 10_000_000,
      recorded: [],
      nextValueCents: 20_000_000,
    });
    // 18 000 kg − 12 % = 15 840 kg
    expect(impact.lives.at(-1)?.avoidedGrams).toBe(15_840_000);
  });

  it('the first lease of a new item avoids nothing', () => {
    const impact = circularImpact(factors, {
      category: 'e_bike',
      previousLives: 0,
      listPriceCents: 100_000,
      recorded: [],
      nextValueCents: 100_000,
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
      listPriceCents: 188_900,
      recorded: [],
      nextValueCents: null,
    });
    expect(impact.lives).toHaveLength(3);
    expect(impact.savedWithNextGrams).toBe(2 * 145_200);
  });

  it('throws on a negative or fractional number of lives', () => {
    const input = {
      category: 'e_bike' as const,
      listPriceCents: 188_900,
      recorded: [],
      nextValueCents: null,
    };
    expect(() => circularImpact(factors, { ...input, previousLives: -1 })).toThrow(RangeError);
    expect(() => circularImpact(factors, { ...input, previousLives: 1.5 })).toThrow(RangeError);
  });
});
