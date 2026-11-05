import { beforeAll, describe, expect, it } from 'vitest';
import { loadResidualCurves } from '@/data/load';
import type { ResidualCurves } from '@/data/schemas';
import { marketValue } from './market-value';

let curves: ResidualCurves;
beforeAll(async () => {
  curves = await loadResidualCurves();
});

describe('marketValue', () => {
  it('uses the curve point exactly: new e-bike at 0 months is worth its price', () => {
    expect(
      marketValue(curves, {
        listPriceCents: 389_000,
        category: 'e_bike',
        ageMonths: 0,
        condition: 'new',
        usageValue: 0,
      })
    ).toEqual({
      valueCents: 389_000,
      curvePercent: 100,
      conditionMultiplier: 1,
      usageAdjustmentPercent: 0,
    });
  });

  it('interpolates between points: e-bike at 7 months is 82 − 12/6 = 80 %', () => {
    const v = marketValue(curves, {
      listPriceCents: 389_000,
      category: 'e_bike',
      ageMonths: 7,
      condition: 'good',
      usageValue: 1_500,
    });
    expect(v.curvePercent).toBe(80);
    expect(v.usageAdjustmentPercent).toBe(-2);
    // 389000 × 0.80 × 0.85 × 0.98 = 259 229.6 → 259 230
    expect(v.valueCents).toBe(259_230);
  });

  it('caps the usage adjustment: ebike-007 with 18 400 km loses at most 20 %', () => {
    const v = marketValue(curves, {
      listPriceCents: 549_000,
      category: 'e_bike',
      ageMonths: 36,
      condition: 'fair',
      usageValue: 18_400,
    });
    expect(v.usageAdjustmentPercent).toBe(-20);
    expect(v.valueCents).toBe(114_192); // 549000 × 0.40 × 0.65 × 0.80
  });

  it('holds the last curve value after the end and handles fractional usage steps (laptops −1.5 %)', () => {
    expect(
      marketValue(curves, {
        listPriceCents: 100_000,
        category: 'laptop',
        ageMonths: 120,
        condition: 'new',
        usageValue: 0,
      }).curvePercent
    ).toBe(12);
    const laptop = marketValue(curves, {
      listPriceCents: 100_000,
      category: 'laptop',
      ageMonths: 12,
      condition: 'new',
      usageValue: 310,
    });
    expect(laptop.usageAdjustmentPercent).toBe(-4.5);
    expect(laptop.valueCents).toBe(57_300); // 100000 × 0.60 × 0.955
  });

  it('throws on fractional cents or a negative age', () => {
    const base = { category: 'e_bike', condition: 'new', usageValue: 0 } as const;
    expect(() => marketValue(curves, { ...base, listPriceCents: 1.5, ageMonths: 1 })).toThrow(
      RangeError
    );
    expect(() => marketValue(curves, { ...base, listPriceCents: 100, ageMonths: -1 })).toThrow(
      RangeError
    );
  });
});
