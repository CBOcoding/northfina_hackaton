// CO₂ saved by giving an item another life (data/co2-factors.json, fictional factors).
//
// The data hint says a reuse avoids `new × (1 − refurbishment share)`. That is not fair for an
// item that is almost worn out: it replaces only the part of a new item's life it has left.
// Our method for a life we can measure:
//
//   avoided = new × (value after refurbishment / today's list price) − new × refurbishment share
//
// The market value already prices age, condition and wear, so it is our measure of "life left".
// Never below 0: a refurbishment that costs more CO₂ than it saves saves nothing.
// For lives before our records (no value known) we can only use the data hint, and say so.
// Everything is in whole grams, rounded once, half up.
import type { AssetCategory, Co2Factors } from '@/data/schemas';
import { percentToBasisPoints, roundHalfUp } from './money';
import type { Cents } from './types';

export type LifeImpact = {
  /** 1 = the item's first lease (a new item: nothing avoided). */
  life: number;
  avoidedGrams: number;
  method: 'new_item' | 'data_hint' | 'wear_adjusted';
};

export type ImpactInput = {
  category: AssetCategory;
  /** Lives the item has already had. */
  previousLives: number;
  /** The coming life, when we know what the item is worth after refurbishment. */
  nextLife: { valueAfterCents: Cents; listPriceCents: Cents } | null;
};

export type CircularImpact = {
  lives: LifeImpact[];
  /** Saved by the lives already lived. */
  savedSoFarGrams: number;
  /** Saved once the coming life has happened too. */
  savedWithNextGrams: number;
};

export function circularImpact(factors: Co2Factors, input: ImpactInput): CircularImpact {
  const { category, previousLives, nextLife } = input;
  if (!Number.isInteger(previousLives) || previousLives < 0) {
    throw new RangeError(`previousLives must be a whole number ≥ 0, got ${previousLives}`);
  }
  const newGrams = Math.round((factors.manufacturing_new_kg[category] ?? 0) * 1000);
  const shareBp = percentToBasisPoints(factors.refurbishment_share_of_new * 100);
  const refurbGrams = roundHalfUp(newGrams * shareBp, 10_000);

  const lives: LifeImpact[] = [];
  for (let life = 1; life <= previousLives; life++) {
    lives.push(
      life === 1
        ? { life, avoidedGrams: 0, method: 'new_item' }
        : { life, avoidedGrams: newGrams - refurbGrams, method: 'data_hint' }
    );
  }
  const savedSoFarGrams = lives.reduce((sum, l) => sum + l.avoidedGrams, 0);

  if (!nextLife || nextLife.listPriceCents <= 0) {
    return { lives, savedSoFarGrams, savedWithNextGrams: savedSoFarGrams };
  }
  const lifeLeftGrams = roundHalfUp(
    newGrams * Math.min(nextLife.valueAfterCents, nextLife.listPriceCents),
    nextLife.listPriceCents
  );
  const next: LifeImpact = {
    life: previousLives + 1,
    avoidedGrams: previousLives === 0 ? 0 : Math.max(0, lifeLeftGrams - refurbGrams),
    method: previousLives === 0 ? 'new_item' : 'wear_adjusted',
  };
  return {
    lives: [...lives, next],
    savedSoFarGrams,
    savedWithNextGrams: savedSoFarGrams + next.avoidedGrams,
  };
}
