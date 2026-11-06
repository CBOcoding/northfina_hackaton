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
// That holds for a life we recorded (the value it went out at) and for the coming one.
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
  /** Today's list price: the base every value is compared with. */
  listPriceCents: Cents;
  /** Lives in our records, with the value the item went out at (its contract's list price). */
  recorded: readonly { life: number; valueCents: Cents }[];
  /** The coming life's value after refurbishment; null when there is no coming life. */
  nextValueCents: Cents | null;
};

export type CircularImpact = {
  lives: LifeImpact[];
  /** Saved by every life that has started: the reuse happens when the item goes out. */
  savedSoFarGrams: number;
  /** Saved once the coming life has happened too. */
  savedWithNextGrams: number;
};

export function circularImpact(factors: Co2Factors, input: ImpactInput): CircularImpact {
  const { category, previousLives, listPriceCents, recorded, nextValueCents } = input;
  if (!Number.isInteger(previousLives) || previousLives < 0) {
    throw new RangeError(`previousLives must be a whole number ≥ 0, got ${previousLives}`);
  }
  const newGrams = Math.round((factors.manufacturing_new_kg[category] ?? 0) * 1000);
  const shareBp = percentToBasisPoints(factors.refurbishment_share_of_new * 100);
  const refurbGrams = roundHalfUp(newGrams * shareBp, 10_000);
  const canMeasure = listPriceCents > 0;
  const wearAdjusted = (valueCents: Cents) =>
    Math.max(
      0,
      roundHalfUp(newGrams * Math.min(valueCents, listPriceCents), listPriceCents) - refurbGrams
    );
  const lifeImpact = (life: number, valueCents: Cents | undefined): LifeImpact => {
    if (life === 1) return { life, avoidedGrams: 0, method: 'new_item' };
    if (valueCents === undefined || !canMeasure) {
      return { life, avoidedGrams: newGrams - refurbGrams, method: 'data_hint' };
    }
    return { life, avoidedGrams: wearAdjusted(valueCents), method: 'wear_adjusted' };
  };

  const values = new Map(recorded.map((r) => [r.life, r.valueCents]));
  const started = Math.max(previousLives, ...recorded.map((r) => r.life));
  const lives: LifeImpact[] = [];
  for (let life = 1; life <= started; life++) lives.push(lifeImpact(life, values.get(life)));
  const savedSoFarGrams = lives.reduce((sum, l) => sum + l.avoidedGrams, 0);

  if (nextValueCents === null || !canMeasure) {
    return { lives, savedSoFarGrams, savedWithNextGrams: savedSoFarGrams };
  }
  const next = lifeImpact(started + 1, nextValueCents);
  return {
    lives: [...lives, next],
    savedSoFarGrams,
    savedWithNextGrams: savedSoFarGrams + next.avoidedGrams,
  };
}
