// Money helpers. Amounts are always integer euro cents; only format at the edge (the UI).
//
// Rounding rule for the whole app: every amount is computed exactly as a fraction of
// integers and rounded ONCE, half up (0.5 cent → 1 cent). Factors and rates are turned
// into integers first (factor × 1 000 000, percent × 100), so no float ever touches money.

/**
 * Formats cents as euros for a locale, e.g. 189900 → "1 899,00 €" (fi) or "€1,899.00" (en).
 * `locale` is a BCP 47 tag such as "fi", "fi-FI" or "en-GB".
 */
export function formatEuro(cents: number, locale: string): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`cents must be a whole number, got ${cents}`);
  }
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Rounds the exact fraction `numerator / denominator` half up. Both must be non-negative integers. */
export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new RangeError(`numerator must be a non-negative safe integer, got ${numerator}`);
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(`denominator must be a positive safe integer, got ${denominator}`);
  }
  return Math.floor((numerator * 2 + denominator) / (denominator * 2));
}

/** 1 000 000: factors are stored as integer millionths. */
export const FACTOR_SCALE = 1_000_000;

/**
 * Turns a coefficient-table factor such as 0.027584 into integer millionths (27584).
 * Throws if the factor has more than 6 decimals, because then the conversion would lose money.
 */
export function factorToMicro(factor: number): number {
  const micro = Math.round(factor * FACTOR_SCALE);
  if (micro < 0 || Math.abs(micro - factor * FACTOR_SCALE) > 1e-6) {
    throw new RangeError(`factor must be non-negative with at most 6 decimals, got ${factor}`);
  }
  return micro;
}

/** `cents × factor`, with the factor in integer millionths, rounded once half up. */
export function applyFactorMicro(cents: number, factorMicro: number): number {
  assertCents(cents);
  return roundHalfUp(cents * factorMicro, FACTOR_SCALE);
}

/** A percent such as 25.5 as basis points (2550). Throws on more than 2 decimals. */
export function percentToBasisPoints(percent: number): number {
  const bp = Math.round(percent * 100);
  if (bp < 0 || Math.abs(bp - percent * 100) > 1e-6) {
    throw new RangeError(`percent must be non-negative with at most 2 decimals, got ${percent}`);
  }
  return bp;
}

/** `cents × basisPoints / 10 000`, rounded once half up. 10730 at 2550 bp → 2736. */
export function applyBasisPoints(cents: number, basisPoints: number): number {
  assertCents(cents);
  return roundHalfUp(cents * basisPoints, 10_000);
}

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`cents must be a non-negative whole number, got ${cents}`);
  }
}

/**
 * Rounds the exact fraction `numerator / denominator` half up, for BigInt fractions that
 * outgrow safe integers (e.g. discounting over many months). Both must be non-negative.
 */
export function roundHalfUpBig(numerator: bigint, denominator: bigint): number {
  if (numerator < 0n || denominator <= 0n) {
    throw new RangeError('numerator must be ≥ 0 and denominator > 0');
  }
  const result = (numerator * 2n + denominator) / (denominator * 2n);
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('result is not a safe integer');
  return Number(result);
}
