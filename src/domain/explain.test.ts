import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { compareTerms, explainPrice, withVat } from './explain';
import { quoteLease, type Quote } from './pricing';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

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
  it('ebike-003: 36 months is cheaper each month, 24 months is cheaper in total', () => {
    const result = compareTerms(table, {
      listPriceCents: 389_000,
      downPaymentCents: 0,
      terms: [24, 36],
      vatRateBp: 2_550,
    });
    expect(result.lowestMonthlyTerm).toBe(36);
    expect(result.lowestTotalTerm).toBe(24);
    const [m24, m36] = result.options;
    expect(m24).toMatchObject({
      ok: true,
      priced: { monthlyGrossCents: 17_347, totalCostCents: 416_328 },
    });
    expect(m36).toMatchObject({
      ok: true,
      priced: { monthlyGrossCents: 13_466, totalCostCents: 484_776 },
    });
  });

  it('keeps a term that cannot be priced, with its reason, and ignores it for the winners', () => {
    const result = compareTerms(table, {
      listPriceCents: 389_000,
      downPaymentCents: 0,
      terms: [18, 36],
      vatRateBp: 2_550,
    });
    expect(result.options[0]).toEqual({ termMonths: 18, ok: false, reason: 'unknown_term' });
    expect(result.lowestMonthlyTerm).toBe(36);
  });

  it('has no winner when nothing can be priced', () => {
    const result = compareTerms(table, {
      listPriceCents: 28_900,
      downPaymentCents: 0,
      terms: [24, 36],
      vatRateBp: 2_550,
    });
    expect(result).toMatchObject({ lowestMonthlyTerm: null, lowestTotalTerm: null });
  });
});
