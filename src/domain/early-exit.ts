// Fair early exit (card 8). There is no official formula, so this is our rule:
//
//   Ending after month m of n, the customer settles what the lease still owes: the
//   remaining n − m rents and the end-of-term buyout, each discounted back to the exit day
//   at the contract's own interest rate (the band's annual_interest_percent / 12 a month).
//   That is the outstanding balance of the financing in the same model the coefficient
//   table is built on: before the first month it equals the amount financed (±1 €).
//
//   payoff = Σ_{j=1..n−m} rent / (1+r)^j  +  buyout / (1+r)^(n−m)
//
// Why it is fair:
//   - to the customer: no interest is charged for months that will not happen, so leaving
//     early never costs more than staying, and the saving is shown;
//   - to us: we get back exactly what the money is still worth to us, nothing less;
//   - consistent: ending after the last month (m = n) costs exactly the normal buyout.
//
// Keep the item (early buyout): pay the payoff. Give it back (early return): the item's market
// value today (residual curve) is credited, so the customer pays max(0, payoff − value).
//
// Discounting is done with exact BigInt fractions: (1+r) = (120 000 + bp) / 120 000 for an
// annual rate of bp basis points, and the sum is rounded once, half up. Amounts are net.
import { percentToBasisPoints, roundHalfUpBig } from './money';
import type { Cents } from './types';

export type EarlyExitInput = {
  monthlyNetCents: Cents;
  termMonths: number;
  buyoutNetCents: Cents;
  annualInterestPercent: number;
  /** Months already invoiced and paid (1..term). */
  monthsPaid: number;
};

export type EarlyExit = {
  monthsPaid: number;
  remainingRents: number;
  /** What the customer pays to keep the item now (net). */
  payoffNetCents: Cents;
  /** The same amounts without discounting: rents left + buyout. */
  undiscountedNetCents: Cents;
  /** Interest the customer does not pay by leaving early. */
  interestSavedCents: Cents;
};

export type EarlyExitResult =
  { ok: true; exit: EarlyExit } | { ok: false; reason: 'month_out_of_range' };

export function earlyExit(input: EarlyExitInput): EarlyExitResult {
  const { monthlyNetCents, termMonths, buyoutNetCents, annualInterestPercent, monthsPaid } = input;
  if (!Number.isInteger(monthsPaid) || monthsPaid < 1 || monthsPaid > termMonths) {
    return { ok: false, reason: 'month_out_of_range' };
  }
  const remaining = termMonths - monthsPaid;
  const b = 120_000n; // 12 months × 10 000 bp
  const a = b + BigInt(percentToBasisPoints(annualInterestPercent));

  // Common denominator a^remaining: rent_j / (a/b)^j = rent × b^j × a^(remaining−j) / a^remaining.
  let numerator = 0n;
  for (let j = 1; j <= remaining; j++) {
    numerator += BigInt(monthlyNetCents) * b ** BigInt(j) * a ** BigInt(remaining - j);
  }
  numerator += BigInt(buyoutNetCents) * b ** BigInt(remaining);
  const payoffNetCents = roundHalfUpBig(numerator, a ** BigInt(remaining));
  const undiscountedNetCents = monthlyNetCents * remaining + buyoutNetCents;

  return {
    ok: true,
    exit: {
      monthsPaid,
      remainingRents: remaining,
      payoffNetCents,
      undiscountedNetCents,
      interestSavedCents: undiscountedNetCents - payoffNetCents,
    },
  };
}

/** Early return: the payoff minus the item's market value, never below zero. */
export function earlyReturnCostCents(payoffNetCents: Cents, marketValueCents: Cents): Cents {
  return Math.max(0, payoffNetCents - marketValueCents);
}
