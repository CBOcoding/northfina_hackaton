import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadVatRates } from '@/data/load';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { daysInMonth, formatIsoDate } from './calendar';
import { compareTerms, explainPrice, withVat, withVatSchedule } from './explain';
import { rentSchedule } from './invoicing';
import { quoteLease, type Quote } from './pricing';

let table: CoefficientTable;
let vatRates: VatRates;
beforeAll(async () => {
  [table, vatRates] = await Promise.all([loadCoefficientTable(), loadVatRates()]);
});

function scheduled(q: Quote, startDate: string) {
  const priced = withVatSchedule(q, vatRates, startDate);
  if (!priced) throw new Error('expected a VAT rate on every date');
  return priced;
}

function quote(listPriceCents: number, downPaymentCents: number, termMonths: number): Quote {
  const result = quoteLease(table, { listPriceCents, downPaymentCents, termMonths });
  if (!result.ok) throw new Error(result.reason);
  return result.quote;
}

describe('withVat', () => {
  it('card 1: 10730 + 2736 VAT = 13466 a month, 484776 over 36 months', () => {
    expect(withVat(quote(389_000, 0, 36), 2_550)).toMatchObject({
      monthlyVatCents: 2_736,
      monthlyGrossCents: 13_466,
      totalCostCents: 484_776,
      buyoutVatCents: 14_879,
      buyoutGrossCents: 73_229,
    });
  });

  it('adds the down payment to the total cost', () => {
    expect(withVat(quote(389_000, 38_900, 36), 2_550).totalCostCents).toBe(
      38_900 + 36 * (9_657 + 2_463)
    );
  });
});

describe('withVatSchedule (Smart Problems 1 and 6: the quote totals what the invoices total)', () => {
  it('card 1 from 5 Nov 2026: 2 invoices at 25.5 %, 34 at 26 %, buyout at 26 % on 5 Nov 2029', () => {
    const priced = scheduled(quote(389_000, 0, 36), '2026-11-05');
    expect(priced).toMatchObject({
      vatRateBp: 2_550,
      monthlyVatCents: 2_736,
      monthlyGrossCents: 13_466,
      totalCostCents: 486_612, // 2 × 134.66 + 34 × 135.20, as on the contract page
      vatChanges: [
        {
          fromDate: '2027-01-05',
          rateBp: 2_600,
          monthlyGrossCents: 13_520,
          differenceCents: 54,
          invoiceCount: 34,
        },
      ],
      buyoutVatRateBp: 2_600,
      buyoutVatCents: 15_171,
      buyoutGrossCents: 73_521,
    });
  });

  it('a term inside one VAT period is the same as withVat at that rate', () => {
    const q = quote(389_000, 38_900, 12);
    expect(scheduled(q, '2027-03-01')).toEqual(withVat(q, 2_600));
  });

  it('is null when a due date has no VAT rate', () => {
    expect(withVatSchedule(quote(389_000, 0, 12), vatRates, '2012-06-01')).toBeNull();
  });

  it('total = down payment + Σ gross of the rent schedule, for any start date (property)', () => {
    const lease = fc.record({
      year: fc.integer({ min: 2025, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 31 }),
      term: fc.constantFrom(12, 24, 36, 48),
      price: fc.integer({ min: 200_000, max: 999_999 }),
      downPercent: fc.integer({ min: 0, max: 20 }),
    });
    fc.assert(
      fc.property(lease, ({ year, month, day, term, price, downPercent }) => {
        const start = formatIsoDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
        const result = quoteLease(table, {
          listPriceCents: price,
          downPaymentCents: Math.floor((price * downPercent) / 100),
          termMonths: term,
        });
        if (!result.ok) return;
        const q = result.quote;
        const invoices = rentSchedule(vatRates, {
          contractNumber: 'X',
          startDate: start,
          termMonths: term,
          monthlyNetCents: q.monthlyNetCents,
        });
        if (!invoices.ok) throw new Error(invoices.reason);
        const priced = scheduled(q, start);
        expect(priced.totalCostCents).toBe(q.downPaymentCents + invoices.totals.grossCents);
        expect(priced.monthlyGrossCents).toBe(invoices.invoices[0]?.grossCents);
        expect(priced.vatChanges.reduce((n, c) => n + c.invoiceCount, 0)).toBeLessThan(term);
      })
    );
  });
});

describe('explainPrice', () => {
  it('lists every step in order, with what the customer pays highlighted', () => {
    const steps = explainPrice(withVat(quote(389_000, 0, 36), 2_550), {
      minCents: 200_000,
      maxCents: 999_999,
    });
    expect(steps.map((s) => s.id)).toEqual([
      'list_price',
      'down_payment',
      'financed',
      'factor',
      'monthly_net',
      'vat',
      'monthly_gross',
      'total_cost',
      'buyout',
    ]);
    expect(steps.filter((s) => s.emphasis).map((s) => s.id)).toEqual([
      'monthly_gross',
      'total_cost',
    ]);
  });

  it('carries the numbers each sentence needs', () => {
    const steps = explainPrice(withVat(quote(389_000, 38_900, 36), 2_550), {
      minCents: 200_000,
      maxCents: 999_999,
    });
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.down_payment).toMatchObject({
      amountCents: 38_900,
      params: { percentOfPrice: 10 },
    });
    expect(byId.financed).toMatchObject({
      amountCents: 350_100,
      params: { band: 'B', bandMinCents: 200_000 },
    });
    expect(byId.factor).toEqual({
      id: 'factor',
      params: { factor: '0.027584', termMonths: 36, band: 'B', annualInterestPercent: 7.9 },
      emphasis: false,
    });
    expect(byId.vat).toMatchObject({ params: { ratePercent: 25.5 } });
    expect(byId.buyout).toMatchObject({ amountCents: 52_515, params: { buyoutPercent: 15 } });
  });

  it('adds a VAT change step after the monthly payment when the rate changes in the term', () => {
    const steps = explainPrice(scheduled(quote(389_000, 0, 36), '2026-11-05'), {
      minCents: 200_000,
      maxCents: 999_999,
    });
    expect(steps.map((s) => s.id).slice(6, 9)).toEqual([
      'monthly_gross',
      'vat_change',
      'total_cost',
    ]);
    expect(steps[7]).toEqual({
      id: 'vat_change',
      amountCents: 54,
      params: {
        fromDate: '2027-01-05',
        ratePercent: 26,
        monthlyGrossCents: 13_520,
        invoiceCount: 34,
      },
      emphasis: false,
    });
    expect(steps.find((s) => s.id === 'total_cost')?.amountCents).toBe(486_612);
    expect(steps.find((s) => s.id === 'buyout')?.params).toMatchObject({
      buyoutGrossCents: 73_521,
      buyoutVatPercent: 26,
    });
  });

  it('sums up: list − down = financed, net + VAT = monthly gross', () => {
    const steps = explainPrice(withVat(quote(549_000, 54_900, 24), 2_600), {
      minCents: 0,
      maxCents: 0,
    });
    const amount = (id: string) => steps.find((s) => s.id === id)?.amountCents ?? NaN;
    expect(amount('list_price') - amount('down_payment')).toBe(amount('financed'));
    expect(amount('monthly_net') + amount('vat')).toBe(amount('monthly_gross'));
  });
});

describe('compareTerms', () => {
  it('ebike-003 from 5 Nov 2026: 36 months is cheaper each month, 24 months in total', () => {
    const result = compareTerms(table, {
      listPriceCents: 389_000,
      downPaymentCents: 0,
      terms: [24, 36],
      vatRates,
      startDate: '2026-11-05',
    });
    expect(result.lowestMonthlyTerm).toBe(36);
    expect(result.lowestTotalTerm).toBe(24);
    const [m24, m36] = result.options;
    expect(m24).toMatchObject({
      ok: true,
      priced: { monthlyGrossCents: 17_347, totalCostCents: 417_846 },
    });
    expect(m36).toMatchObject({
      ok: true,
      priced: { monthlyGrossCents: 13_466, totalCostCents: 486_612 },
    });
  });

  it('keeps a term that cannot be priced, with its reason, and ignores it for the winners', () => {
    const result = compareTerms(table, {
      listPriceCents: 389_000,
      downPaymentCents: 0,
      terms: [18, 36],
      vatRates,
      startDate: '2026-11-05',
    });
    expect(result.options[0]).toEqual({ termMonths: 18, ok: false, reason: 'unknown_term' });
    expect(result.lowestMonthlyTerm).toBe(36);
  });

  it('has no winner when nothing can be priced', () => {
    const result = compareTerms(table, {
      listPriceCents: 28_900,
      downPaymentCents: 0,
      terms: [24, 36],
      vatRates,
      startDate: '2026-11-05',
    });
    expect(result).toMatchObject({ lowestMonthlyTerm: null, lowestTotalTerm: null });
  });
});
