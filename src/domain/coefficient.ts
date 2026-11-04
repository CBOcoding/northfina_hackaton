// Worked example 1: look up the monthly rent factor in the coefficient table.
// monthly net rent (cents) = financed amount (cents) × factor. Rounding is your decision.
import type { CoefficientBand, CoefficientTable } from '@/data/schemas';

export type MonthlyFactorResult =
  | { ok: true; band: CoefficientBand; factor: number }
  | { ok: false; reason: 'below_minimum' | 'above_maximum' | 'unknown_term' };

/**
 * Finds the band for `financedCents` and the factor for `termMonths` in that band.
 * Both band limits are inclusive: 199 999 cents is band A, 200 000 cents is band B.
 *
 * Returns a result instead of throwing, because "this amount cannot be financed" is a
 * normal business answer that the UI must show, not a bug.
 */
export function monthlyFactorFor(
  table: CoefficientTable,
  financedCents: number,
  termMonths: number
): MonthlyFactorResult {
  if (!Number.isInteger(financedCents)) {
    // A non-integer here is a programming error: money is always whole cents.
    throw new RangeError(`financedCents must be whole cents, got ${financedCents}`);
  }

  const band = table.bands.find(
    (b) => financedCents >= b.min_financed_cents && financedCents <= b.max_financed_cents
  );
  if (!band) {
    const lowest = Math.min(...table.bands.map((b) => b.min_financed_cents));
    return { ok: false, reason: financedCents < lowest ? 'below_minimum' : 'above_maximum' };
  }

  const factor = band.monthly_factor_by_term[String(termMonths)];
  if (factor === undefined) return { ok: false, reason: 'unknown_term' };

  return { ok: true, band, factor };
}
