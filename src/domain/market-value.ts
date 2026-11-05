// What a used item is worth on the market (data/residual-curves.json):
//
//   value = list price at its lease × curve(age in months) × condition multiplier × usage adjustment
//
// The curve is interpolated linearly between its points and holds its last value after the
// end. All four factors are turned into integer fractions and multiplied exactly, then the
// result is rounded once, half up. Shared by early exit and second life.
import type { AssetCategory, AssetCondition, ResidualCurves } from '@/data/schemas';
import { percentToBasisPoints, roundHalfUpBig } from './money';
import type { Cents } from './types';

export type MarketValueInput = {
  listPriceCents: Cents;
  category: AssetCategory;
  ageMonths: number;
  condition: AssetCondition;
  /** Usage in the category's unit (km, battery cycles, engine hours). */
  usageValue: number;
};

export type MarketValue = {
  valueCents: Cents;
  /** The three factors, for showing the calculation. */
  curvePercent: number;
  conditionMultiplier: number;
  usageAdjustmentPercent: number;
};

/** Curve percent at `ageMonths` as an exact fraction: basis points / denominator. */
function curveAt(points: readonly (readonly [number, number])[], ageMonths: number) {
  const last = points[points.length - 1];
  if (!last || ageMonths >= last[0])
    return { bp: BigInt(percentToBasisPoints(last?.[1] ?? 0)), den: 1n };
  for (let i = 1; i < points.length; i++) {
    const [a1, p1] = points[i] ?? [0, 0];
    const [a0, p0] = points[i - 1] ?? [0, 0];
    if (ageMonths <= a1) {
      const bp0 = BigInt(percentToBasisPoints(p0));
      const bp1 = BigInt(percentToBasisPoints(p1));
      const span = BigInt(a1 - a0);
      return { bp: bp0 * span + (bp1 - bp0) * BigInt(ageMonths - a0), den: span };
    }
  }
  return { bp: BigInt(percentToBasisPoints(points[0]?.[1] ?? 0)), den: 1n };
}

export function marketValue(curves: ResidualCurves, input: MarketValueInput): MarketValue {
  const { listPriceCents, category, ageMonths, condition, usageValue } = input;
  if (!Number.isSafeInteger(listPriceCents) || listPriceCents < 0) {
    throw new RangeError(`listPriceCents must be whole cents ≥ 0, got ${listPriceCents}`);
  }
  if (!Number.isInteger(ageMonths) || ageMonths < 0) {
    throw new RangeError(`ageMonths must be a whole number ≥ 0, got ${ageMonths}`);
  }
  const points = curves.curves[category] ?? [];
  const curve = curveAt(points, ageMonths);

  const multiplier = curves.condition_multiplier[condition] ?? 0;
  const conditionPermille = BigInt(Math.round(multiplier * 1000));

  const usage = curves.usage_adjustment[category];
  const rawAdjustment = usage
    ? Math.floor(Math.max(usageValue, 0) / usage.step) * usage.percent_per_step
    : 0;
  // `|| 0` turns −0 (no usage) into 0.
  const adjustmentPercent = (usage ? Math.max(rawAdjustment, usage.max_total_percent) : 0) || 0;
  const adjustmentBp = BigInt(Math.round(adjustmentPercent * 100)); // e.g. −20 % → −2000

  // price × (curve bp / den / 10 000) × (permille / 1000) × ((10 000 + adj bp) / 10 000)
  const numerator =
    BigInt(listPriceCents) * curve.bp * conditionPermille * (10_000n + adjustmentBp);
  const denominator = curve.den * 10_000n * 1_000n * 10_000n;

  return {
    valueCents: roundHalfUpBig(numerator, denominator),
    curvePercent: Number(curve.bp) / Number(curve.den) / 100,
    conditionMultiplier: multiplier,
    usageAdjustmentPercent: adjustmentPercent,
  };
}
