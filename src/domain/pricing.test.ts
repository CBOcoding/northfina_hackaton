import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { quoteLease, type Quote } from './pricing';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

function quote(listPriceCents: number, downPaymentCents: number, termMonths: number): Quote {
  const result = quoteLease(table, { listPriceCents, downPaymentCents, termMonths });
  if (!result.ok) throw new Error(`expected a quote, got ${result.reason}`);
  return result.quote;
}

describe('quoteLease: the scenario cards', () => {
  it('card 1 / DATA.md worked example: ebike-003, 36 months, no down payment', () => {
    expect(quote(389_000, 0, 36)).toEqual({
      listPriceCents: 389_000,
      downPaymentCents: 0,
      financedCents: 389_000,
      band: 'B',
      annualInterestPercent: 7.9,
      factorMicro: 27_584,
      termMonths: 36,
      monthlyNetCents: 10_730,
      totalRentNetCents: 386_280,
      buyoutPercent: 15,
      buyoutNetCents: 58_350,
    });
  });

  it('card 2: laptop-004 is 9627/month on price list v1 and 8857/month on v2', () => {
    expect(quote(349_000, 0, 36).monthlyNetCents).toBe(9_627);
    expect(quote(321_100, 0, 36).monthlyNetCents).toBe(8_857);
  });

  it('card 3: ebike-001, 24 months, band A → 6957', () => {
    expect(quote(189_900, 0, 24)).toMatchObject({ band: 'A', monthlyNetCents: 6_957 });
  });

  it('card 4: laptop-001, 36 months → 3432', () => {
    expect(quote(119_900, 0, 36).monthlyNetCents).toBe(3_432);
  });

  it('card 7: farm-002 with 20 000 € down, 48 months: band D, exact half cent rounds up', () => {
    expect(quote(14_500_000, 2_000_000, 48)).toMatchObject({
      financedCents: 12_500_000,
      band: 'D',
      monthlyNetCents: 272_038,
      buyoutNetCents: 1_000_000,
    });
  });
});

describe('quoteLease: down payment', () => {
  it('lowers the financed amount and can move it to a cheaper band', () => {
    const q = quote(210_000, 20_000, 36);
    expect(q.financedCents).toBe(190_000);
    expect(q.band).toBe('A');
  });

  it('refuses a negative down payment', () => {
    expect(
      quoteLease(table, { listPriceCents: 189_900, downPaymentCents: -1, termMonths: 24 })
    ).toEqual({ ok: false, reason: 'down_payment_negative' });
  });

  it('refuses a down payment equal to or above the price', () => {
    for (const down of [189_900, 200_000]) {
      expect(
        quoteLease(table, { listPriceCents: 189_900, downPaymentCents: down, termMonths: 24 })
      ).toEqual({ ok: false, reason: 'down_payment_not_below_price' });
    }
  });

  it('refuses when the down payment leaves less than 300 € to finance', () => {
    expect(
      quoteLease(table, { listPriceCents: 50_000, downPaymentCents: 30_000, termMonths: 12 })
    ).toEqual({ ok: false, reason: 'below_minimum' });
  });
});

describe('quoteLease: limits', () => {
  it('refuses ebike-010 (289 €) as too cheap to lease', () => {
    expect(
      quoteLease(table, { listPriceCents: 28_900, downPaymentCents: 0, termMonths: 12 })
    ).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('refuses farm-006 (260 000 €) as above the maximum', () => {
    expect(
      quoteLease(table, { listPriceCents: 26_000_000, downPaymentCents: 0, termMonths: 48 })
    ).toEqual({ ok: false, reason: 'above_maximum' });
  });

  it('refuses a term that is not 12, 24, 36 or 48 months', () => {
    expect(
      quoteLease(table, { listPriceCents: 189_900, downPaymentCents: 0, termMonths: 18 })
    ).toEqual({ ok: false, reason: 'unknown_term' });
  });

  it('keeps the laptop band boundary: 1 999,99 € is band A, 2 000,00 € is band B', () => {
    expect(quote(199_999, 0, 36).band).toBe('A');
    expect(quote(200_000, 0, 36).band).toBe('B');
  });

  it('throws on fractions of a cent, because that is a bug in the caller', () => {
    expect(() =>
      quoteLease(table, { listPriceCents: 1_000.5, downPaymentCents: 0, termMonths: 12 })
    ).toThrow(RangeError);
  });
});

describe('quoteLease: totals', () => {
  it('total rent is exactly monthly rent × term for every term', () => {
    for (const term of [12, 24, 36, 48]) {
      const q = quote(389_000, 0, term);
      expect(q.totalRentNetCents).toBe(q.monthlyNetCents * term);
    }
  });

  it('buyout percent follows the table: 40/25/15/8 %', () => {
    expect([12, 24, 36, 48].map((t) => quote(100_000, 0, t).buyoutNetCents)).toEqual([
      40_000, 25_000, 15_000, 8_000,
    ]);
  });
});
