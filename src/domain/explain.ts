// "Explain my price" (Smart Problem 6): the steps from list price to what the customer pays,
// in the order a person would check them, plus a side-by-side comparison of two terms.
//
// The domain returns step ids and numbers only; the UI turns each id into a sentence in the
// customer's language (src/i18n). Every amount here comes from pricing.ts and money.ts, so
// the explanation can never disagree with the contract.
import type { CoefficientTable } from '@/data/schemas';
import { applyBasisPoints } from './money';
import { quoteLease, type Quote, type QuoteRefusal } from './pricing';
import type { Cents } from './types';

export type ExplainStepId =
  | 'list_price'
  | 'down_payment'
  | 'financed'
  | 'factor'
  | 'monthly_net'
  | 'vat'
  | 'monthly_gross'
  | 'total_cost'
  | 'buyout';

export type ExplainStep = {
  id: ExplainStepId;
  /** The amount on this line, in cents (absent for the factor line). */
  amountCents?: Cents;
  /** Numbers the sentence needs, e.g. the band, the factor or the VAT rate. */
  params: Record<string, string | number>;
  /** The line to highlight: what the customer pays. */
  emphasis: boolean;
};

/** What a quote costs once VAT is added at `vatRateBp` (the rate on the quote day). */
export type PricedWithVat = {
  quote: Quote;
  vatRateBp: number;
  monthlyVatCents: Cents;
  monthlyGrossCents: Cents;
  /** Down payment + all monthly payments with VAT. Excludes the optional buyout. */
  totalCostCents: Cents;
  buyoutVatCents: Cents;
  buyoutGrossCents: Cents;
};

export function withVat(quote: Quote, vatRateBp: number): PricedWithVat {
  const monthlyVatCents = applyBasisPoints(quote.monthlyNetCents, vatRateBp);
  const monthlyGrossCents = quote.monthlyNetCents + monthlyVatCents;
  const buyoutVatCents = applyBasisPoints(quote.buyoutNetCents, vatRateBp);
  return {
    quote,
    vatRateBp,
    monthlyVatCents,
    monthlyGrossCents,
    totalCostCents: quote.downPaymentCents + monthlyGrossCents * quote.termMonths,
    buyoutVatCents,
    buyoutGrossCents: quote.buyoutNetCents + buyoutVatCents,
  };
}

/** The explanation, step by step. */
export function explainPrice(
  priced: PricedWithVat,
  bandLimits: { minCents: Cents; maxCents: Cents }
): ExplainStep[] {
  const { quote } = priced;
  const step = (
    id: ExplainStepId,
    amountCents: Cents | undefined,
    params: ExplainStep['params'] = {},
    emphasis = false
  ): ExplainStep =>
    amountCents === undefined ? { id, params, emphasis } : { id, amountCents, params, emphasis };

  return [
    step('list_price', quote.listPriceCents),
    step('down_payment', quote.downPaymentCents, {
      percentOfPrice: Math.round((quote.downPaymentCents * 100) / quote.listPriceCents),
    }),
    step('financed', quote.financedCents, {
      band: quote.band,
      bandMinCents: bandLimits.minCents,
      bandMaxCents: bandLimits.maxCents,
    }),
    step('factor', undefined, {
      factor: (quote.factorMicro / 1_000_000).toFixed(6),
      termMonths: quote.termMonths,
      band: quote.band,
      annualInterestPercent: quote.annualInterestPercent,
    }),
    step('monthly_net', quote.monthlyNetCents),
    step('vat', priced.monthlyVatCents, { ratePercent: priced.vatRateBp / 100 }),
    step('monthly_gross', priced.monthlyGrossCents, {}, true),
    step('total_cost', priced.totalCostCents, { termMonths: quote.termMonths }, true),
    step('buyout', quote.buyoutNetCents, {
      buyoutPercent: quote.buyoutPercent,
      buyoutGrossCents: priced.buyoutGrossCents,
    }),
  ];
}

export type TermOption =
  | { termMonths: number; ok: true; priced: PricedWithVat }
  | { termMonths: number; ok: false; reason: QuoteRefusal };

export type TermComparison = {
  options: TermOption[];
  /** Term with the lowest monthly payment, or null if none can be priced. */
  lowestMonthlyTerm: number | null;
  /** Term with the lowest total cost (down payment + all monthly payments). */
  lowestTotalTerm: number | null;
};

/** Prices the same item and down payment for several terms, e.g. 24 vs 36 months. */
export function compareTerms(
  table: CoefficientTable,
  input: {
    listPriceCents: Cents;
    downPaymentCents: Cents;
    terms: readonly number[];
    vatRateBp: number;
  }
): TermComparison {
  const options: TermOption[] = input.terms.map((termMonths) => {
    const result = quoteLease(table, {
      listPriceCents: input.listPriceCents,
      downPaymentCents: input.downPaymentCents,
      termMonths,
    });
    return result.ok
      ? { termMonths, ok: true, priced: withVat(result.quote, input.vatRateBp) }
      : { termMonths, ok: false, reason: result.reason };
  });

  const priced = options.flatMap((o) => (o.ok ? [o] : []));
  const lowestBy = (value: (o: (typeof priced)[number]) => number): number | null => {
    const best = priced.reduce<(typeof priced)[number] | null>(
      (min, o) => (min === null || value(o) < value(min) ? o : min),
      null
    );
    return best ? best.termMonths : null;
  };

  return {
    options,
    lowestMonthlyTerm: lowestBy((o) => o.priced.monthlyGrossCents),
    lowestTotalTerm: lowestBy((o) => o.priced.totalCostCents),
  };
}
