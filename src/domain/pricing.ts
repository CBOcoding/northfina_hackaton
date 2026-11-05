// The quote: from a net list price, a down payment and a term to the monthly net rent.
//
//   financed       = list price − down payment
//   monthly rent   = financed × factor(band of financed, term)     rounded once, half up
//   buyout         = financed × buyout percent(term) / 100          rounded once, half up
//
// All amounts are net (VAT excluded). VAT is added per invoice by the invoicing module,
// because the rate depends on the invoice date, not on the quote.
import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';
import { applyFactorMicro, factorToMicro, roundHalfUp } from './money';
import type { Cents, TermMonths } from './types';

export type QuoteInput = {
  listPriceCents: Cents;
  downPaymentCents: Cents;
  termMonths: number;
};

export type Quote = {
  listPriceCents: Cents;
  downPaymentCents: Cents;
  financedCents: Cents;
  band: string;
  annualInterestPercent: number;
  factorMicro: number;
  termMonths: TermMonths;
  monthlyNetCents: Cents;
  /** Monthly rent × term: the net rent the contract will invoice in total. */
  totalRentNetCents: Cents;
  buyoutPercent: number;
  buyoutNetCents: Cents;
};

export type QuoteRefusal =
  | 'down_payment_negative'
  | 'down_payment_not_below_price'
  | 'below_minimum'
  | 'above_maximum'
  | 'unknown_term';

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; reason: QuoteRefusal };

/**
 * Prices a lease. Refusals are values (the UI shows them), not exceptions.
 * The down payment must be at least 0 and less than the list price.
 */
export function quoteLease(table: CoefficientTable, input: QuoteInput): QuoteResult {
  const { listPriceCents, downPaymentCents, termMonths } = input;
  if (!Number.isInteger(listPriceCents) || !Number.isInteger(downPaymentCents)) {
    throw new RangeError('list price and down payment must be whole cents');
  }
  if (downPaymentCents < 0) return { ok: false, reason: 'down_payment_negative' };
  if (downPaymentCents >= listPriceCents) {
    return { ok: false, reason: 'down_payment_not_below_price' };
  }

  const financedCents = listPriceCents - downPaymentCents;
  const factor = monthlyFactorFor(table, financedCents, termMonths);
  if (!factor.ok) return { ok: false, reason: factor.reason };

  const buyoutPercent = table.end_of_term_buyout_percent_of_financed[String(termMonths)];
  if (buyoutPercent === undefined) return { ok: false, reason: 'unknown_term' };

  const factorMicro = factorToMicro(factor.factor);
  const monthlyNetCents = applyFactorMicro(financedCents, factorMicro);

  return {
    ok: true,
    quote: {
      listPriceCents,
      downPaymentCents,
      financedCents,
      band: factor.band.band,
      annualInterestPercent: factor.band.annual_interest_percent,
      factorMicro,
      termMonths: termMonths as TermMonths,
      monthlyNetCents,
      totalRentNetCents: monthlyNetCents * termMonths,
      buyoutPercent,
      buyoutNetCents: roundHalfUp(financedCents * buyoutPercent, 100),
    },
  };
}
