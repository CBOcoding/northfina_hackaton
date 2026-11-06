// Down payment choices on the quote screen, in whole euros.
//
// Percent steps do not work across our catalogue: prices run from 289 € to 145 000 €, and
// card 7 asks for exactly 20 000 € down on 145 000 € (13.8 %). So the slider moves in euro
// steps that grow with the price, suggests a few round amounts, and accepts any typed
// whole-euro amount up to the maximum.
//
//   step     = 50 € under 5 000 €, 100 € up to 20 000 €, 500 € above
//   maximum  = the lower of 50 % of the price and (price − lowest financed amount),
//              rounded down to a whole step
import type { CoefficientBand, CoefficientTable } from '@/data/schemas';
import type { Cents } from './types';

const EURO = 100;

/** The most a customer can pay down, as a share of the list price. Our product choice. */
export const MAX_DOWN_SHARE_PERCENT = 50;

/** Round amounts we suggest, by price range (euros). */
const SUGGESTED_EUROS = {
  small: [250, 500, 750, 1_000],
  medium: [1_000, 2_000, 3_000, 5_000],
  large: [5_000, 10_000, 20_000, 30_000],
} as const;

function priceRange(listPriceCents: Cents): keyof typeof SUGGESTED_EUROS {
  if (listPriceCents < 5_000 * EURO) return 'small';
  if (listPriceCents <= 20_000 * EURO) return 'medium';
  return 'large';
}

/** Slider step in cents for an item with this list price. */
export function downPaymentStepCents(listPriceCents: Cents): Cents {
  const range = priceRange(listPriceCents);
  if (range === 'small') return 50 * EURO;
  if (range === 'medium') return 100 * EURO;
  return 500 * EURO;
}

function lowestFinancedCents(table: CoefficientTable): Cents {
  return Math.min(...table.bands.map((b) => b.min_financed_cents));
}

/**
 * The largest down payment we offer: at most half the price, and never so much that the
 * amount financed falls below our minimum. Always a whole number of steps; 0 when the item
 * cannot take a down payment at all.
 */
export function maxDownPaymentCents(table: CoefficientTable, listPriceCents: Cents): Cents {
  const step = downPaymentStepCents(listPriceCents);
  const half = Math.floor((listPriceCents * MAX_DOWN_SHARE_PERCENT) / 100);
  const room = listPriceCents - lowestFinancedCents(table);
  const cap = Math.min(half, room);
  return cap <= 0 ? 0 : Math.floor(cap / step) * step;
}

/** 0 ("none") followed by the round amounts that fit under the maximum. */
export function suggestedDownPayments(table: CoefficientTable, listPriceCents: Cents): Cents[] {
  const max = maxDownPaymentCents(table, listPriceCents);
  const amounts = SUGGESTED_EUROS[priceRange(listPriceCents)]
    .map((euros) => euros * EURO)
    .filter((cents) => cents <= max);
  return [0, ...amounts];
}

/** Whatever was typed or slid, as whole euros between 0 and the maximum. */
export function clampDownPayment(
  table: CoefficientTable,
  listPriceCents: Cents,
  requestedCents: number
): Cents {
  if (!Number.isFinite(requestedCents) || requestedCents <= 0) return 0;
  const wholeEuros = Math.floor(requestedCents / EURO) * EURO;
  return Math.min(wholeEuros, maxDownPaymentCents(table, listPriceCents));
}

function bandFor(table: CoefficientTable, financedCents: Cents): CoefficientBand | undefined {
  return table.bands.find(
    (b) => financedCents >= b.min_financed_cents && financedCents <= b.max_financed_cents
  );
}

function lowerBand(table: CoefficientTable, band: CoefficientBand): CoefficientBand | undefined {
  return table.bands
    .filter((b) => b.max_financed_cents < band.min_financed_cents)
    .sort((a, b) => b.max_financed_cents - a.max_financed_cents)[0];
}

/**
 * Lower bands carry a higher yearly interest, so a bigger down payment can make the money
 * that is still financed more expensive. We tell the customer before they get there:
 *
 * - `moved`: their down payment already moved the financed amount into a lower band;
 *   `keepUpToCents` is the largest whole-euro down payment that keeps the original band.
 * - `crosses`: from `fromCents` down (still within the maximum) it would move.
 */
export type BandHint =
  | {
      kind: 'moved';
      band: string;
      annualInterestPercent: number;
      originalBand: string;
      originalInterestPercent: number;
      keepUpToCents: Cents;
    }
  | {
      kind: 'crosses';
      fromCents: Cents;
      band: string;
      annualInterestPercent: number;
      currentBand: string;
      currentInterestPercent: number;
    };

export function bandHint(
  table: CoefficientTable,
  listPriceCents: Cents,
  downPaymentCents: Cents
): BandHint | null {
  const original = bandFor(table, listPriceCents);
  const current = bandFor(table, listPriceCents - downPaymentCents);
  if (!original || !current) return null;

  if (current.min_financed_cents < original.min_financed_cents) {
    return {
      kind: 'moved',
      band: current.band,
      annualInterestPercent: current.annual_interest_percent,
      originalBand: original.band,
      originalInterestPercent: original.annual_interest_percent,
      keepUpToCents: Math.floor((listPriceCents - original.min_financed_cents) / EURO) * EURO,
    };
  }

  const below = lowerBand(table, current);
  if (!below) return null;
  // Smallest whole-euro down payment that takes the financed amount under this band.
  const fromCents = Math.ceil((listPriceCents - current.min_financed_cents + 1) / EURO) * EURO;
  if (fromCents > maxDownPaymentCents(table, listPriceCents)) return null;
  return {
    kind: 'crosses',
    fromCents,
    band: below.band,
    annualInterestPercent: below.annual_interest_percent,
    currentBand: current.band,
    currentInterestPercent: current.annual_interest_percent,
  };
}
