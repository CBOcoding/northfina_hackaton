// "Explain my price" (Smart Problem 6): the steps from list price to what the customer pays,
// in the order a person would check them, plus a side-by-side comparison of two terms.
//
// The domain returns step ids and numbers only; the UI turns each id into a sentence in the
// customer's language (src/i18n). Every amount here comes from pricing.ts and money.ts, so
// the explanation can never disagree with the contract.
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { addMonthsClamped } from './calendar';
import { rentSchedule } from './invoicing';
import { applyBasisPoints } from './money';
import { quoteLease, type Quote, type QuoteRefusal } from './pricing';
import type { Cents, IsoDate } from './types';
import { vatRateOn } from './vat';

export type ExplainStepId =
  | 'list_price'
  | 'down_payment'
  | 'financed'
  | 'factor'
  | 'monthly_net'
  | 'vat'
  | 'monthly_gross'
  | 'vat_change'
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

/** From `fromDate` on, `invoiceCount` invoices carry VAT at `rateBp`. */
export type VatChange = {
  fromDate: IsoDate;
  rateBp: number;
  monthlyGrossCents: Cents;
  /** This invoice minus the one before the change (negative if VAT goes down). */
  differenceCents: Cents;
  invoiceCount: number;
};

/** What a quote costs with VAT. The monthly figures are the first invoice's. */
export type PricedWithVat = {
  quote: Quote;
  vatRateBp: number;
  monthlyVatCents: Cents;
  monthlyGrossCents: Cents;
  /** Down payment + all monthly payments with VAT. Excludes the optional buyout. */
  totalCostCents: Cents;
  /** VAT rate changes during the term, in order (empty when one rate covers it all). */
  vatChanges: VatChange[];
  buyoutVatRateBp: number;
  buyoutVatCents: Cents;
  buyoutGrossCents: Cents;
};

/** Everything at one VAT rate, e.g. today's, as if it never changed during the term. */

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
    vatChanges: [],
    buyoutVatRateBp: vatRateBp,
    buyoutVatCents,
    buyoutGrossCents: quote.buyoutNetCents + buyoutVatCents,
  };
}

/**
 * The quote as it will be invoiced for a lease starting on `startDate`: the total is the down
 * payment + Σ gross of the real rent schedule (VAT of each due date, see invoicing.ts), and the
 * buyout carries VAT of the term-end date, when it would be invoiced. So the quote's total equals
 * the invoices' to the cent. null when a date in the term has no VAT rate.
 */
export function withVatSchedule(
  quote: Quote,
  vatRates: VatRates,
  startDate: IsoDate
): PricedWithVat | null {
  const schedule = rentSchedule(vatRates, {
    contractNumber: 'QUOTE',
    startDate,
    termMonths: quote.termMonths,
    monthlyNetCents: quote.monthlyNetCents,
  });
  const buyoutRate = vatRateOn(vatRates, addMonthsClamped(startDate, quote.termMonths));
  if (!schedule.ok || !buyoutRate.ok) return null;

  const periods: VatChange[] = [];
  for (const invoice of schedule.invoices) {
    const last = periods.at(-1);
    if (last?.rateBp === invoice.vatRateBp) last.invoiceCount++;
    else
      periods.push({
        fromDate: invoice.dueDate,
        rateBp: invoice.vatRateBp,
        monthlyGrossCents: invoice.grossCents,
        differenceCents: last ? invoice.grossCents - last.monthlyGrossCents : 0,
        invoiceCount: 1,
      });
  }
  const [first, ...vatChanges] = periods;
  if (!first) return null; // unreachable: rentSchedule always has ≥ 1 invoice
  const buyoutVatCents = applyBasisPoints(quote.buyoutNetCents, buyoutRate.rateBp);
  return {
    quote,
    vatRateBp: first.rateBp,
    monthlyVatCents: first.monthlyGrossCents - quote.monthlyNetCents,
    monthlyGrossCents: first.monthlyGrossCents,
    totalCostCents: quote.downPaymentCents + schedule.totals.grossCents,
    vatChanges,
    buyoutVatRateBp: buyoutRate.rateBp,
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
    ...priced.vatChanges.map((c) =>
      step('vat_change', c.differenceCents, {
        fromDate: c.fromDate,
        ratePercent: c.rateBp / 100,
        monthlyGrossCents: c.monthlyGrossCents,
        invoiceCount: c.invoiceCount,
      })
    ),
    step('total_cost', priced.totalCostCents, { termMonths: quote.termMonths }, true),
    step('buyout', quote.buyoutNetCents, {
      buyoutPercent: quote.buyoutPercent,
      buyoutGrossCents: priced.buyoutGrossCents,
      buyoutVatPercent: priced.buyoutVatRateBp / 100,
    }),
  ];
}

export type TermOption =
  | { termMonths: number; ok: true; priced: PricedWithVat }
  | { termMonths: number; ok: false; reason: QuoteRefusal | 'no_vat_rate' };

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
    vatRates: VatRates;
    /** The day the lease would start: each invoice gets VAT of its own due date. */
    startDate: IsoDate;
  }
): TermComparison {
  const options: TermOption[] = input.terms.map((termMonths) => {
    const result = quoteLease(table, {
      listPriceCents: input.listPriceCents,
      downPaymentCents: input.downPaymentCents,
      termMonths,
    });
    if (!result.ok) return { termMonths, ok: false, reason: result.reason };
    const priced = withVatSchedule(result.quote, input.vatRates, input.startDate);
    return priced
      ? { termMonths, ok: true, priced }
      : { termMonths, ok: false, reason: 'no_vat_rate' };
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
