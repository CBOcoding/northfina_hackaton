// The coefficient table is not a black box: every factor is the monthly payment of a loan of
// 1 € at the band's yearly interest (monthly rate r = yearly / 12), paid in n monthly
// instalments, with the end-of-term buyout as a final lump sum:
//
//   factor = (1 − buyout% × (1 + r)^−n) × r / (1 − (1 + r)^−n)
//
// This test rebuilds all 16 factors from that model. Our fair early exit (early-exit.ts)
// discounts the remaining rents and the buyout at the same rate, so what it charges is the
// outstanding balance of exactly this loan.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

function modelFactor(annualPercent: number, termMonths: number, buyoutPercent: number): number {
  const r = annualPercent / 100 / 12;
  const discount = (1 + r) ** -termMonths;
  return ((1 - (buyoutPercent / 100) * discount) * r) / (1 - discount);
}

describe('coefficient table model', () => {
  it('every factor equals the loan-with-buyout payment, to all 6 decimals', () => {
    let checked = 0;
    for (const band of table.bands) {
      for (const [term, factor] of Object.entries(band.monthly_factor_by_term)) {
        const buyout = table.end_of_term_buyout_percent_of_financed[term];
        expect(buyout, `buyout for ${term} months`).toBeDefined();
        const rebuilt = modelFactor(band.annual_interest_percent, Number(term), buyout ?? 0);
        expect(rebuilt.toFixed(6), `band ${band.band}, ${term} months`).toBe(factor.toFixed(6));
        checked++;
      }
    }
    expect(checked).toBe(16);
  });
});
