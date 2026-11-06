import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { addMonthsClamped, dayBefore, daysInMonth, formatIsoDate, parseIsoDate } from './calendar';
import { invoiceLine, invoiceNumber, rentSchedule, sumInvoices } from './invoicing';
import type { InvoiceLine } from './types';
import { vatRateOn } from './vat';

let rates: VatRates;
beforeAll(async () => {
  rates = await loadVatRates();
});

function schedule(startDate: string, termMonths: number, monthlyNetCents: number) {
  const result = rentSchedule(rates, {
    contractNumber: 'ML-2026-0001',
    startDate,
    termMonths,
    monthlyNetCents,
  });
  if (!result.ok) throw new Error(`expected invoices, got ${result.reason}`);
  return result;
}

const pick = (i: InvoiceLine) => [i.dueDate, i.netCents, i.vatRateBp, i.vatCents, i.grossCents];

describe('card 1: Aino, ebike-003, 36 months from 5 Nov 2026', () => {
  it('first 3 invoices: VAT 25.5 % in 2026, 26 % from January 2027', () => {
    const { invoices } = schedule('2026-11-05', 36, 10_730);
    expect(invoices.slice(0, 3).map(pick)).toEqual([
      ['2026-11-05', 10_730, 2_550, 2_736, 13_466],
      ['2026-12-05', 10_730, 2_550, 2_736, 13_466],
      ['2027-01-05', 10_730, 2_600, 2_790, 13_520],
    ]);
  });

  it('totals add up: 36 × 10730 net, 486612 gross', () => {
    const { totals, invoices } = schedule('2026-11-05', 36, 10_730);
    expect(invoices).toHaveLength(36);
    expect(totals).toEqual({ netCents: 386_280, vatCents: 100_332, grossCents: 486_612 });
  });

  it('numbers invoices and gives each a one-month period', () => {
    const [first] = schedule('2026-11-05', 36, 10_730).invoices;
    expect(first).toMatchObject({
      seq: 1,
      number: 'ML-2026-0001-001',
      kind: 'rent',
      periodStart: '2026-11-05',
      periodEnd: '2026-12-04',
      status: 'issued',
    });
  });
});

describe('card 3: ebike-001, 24 months from 15 Sep 2026', () => {
  it('December 2026 is 8731 (25.5 %) and January 2027 is 8766 (26 %): same net rent', () => {
    const { invoices } = schedule('2026-09-15', 24, 6_957);
    const byDue = (d: string) => invoices.find((i) => i.dueDate === d);
    expect(byDue('2026-12-15')).toMatchObject({
      netCents: 6_957,
      vatCents: 1_774,
      grossCents: 8_731,
    });
    expect(byDue('2027-01-15')).toMatchObject({
      netCents: 6_957,
      vatCents: 1_809,
      grossCents: 8_766,
    });
  });
});

describe('card 4: laptop-001, 36 months from 31 Jan 2026', () => {
  it('February 2026 is due on the 28th and February 2028 on the 29th', () => {
    const { invoices } = schedule('2026-01-31', 36, 3_432);
    const feb = invoices.filter((i) => i.dueDate.slice(5, 7) === '02').map((i) => i.dueDate);
    expect(feb).toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
    expect(invoices[2]?.dueDate).toBe('2026-03-31');
  });
});

describe('rentSchedule: edges', () => {
  it('reports a missing VAT rate instead of inventing one', () => {
    expect(
      rentSchedule(rates, {
        contractNumber: 'X',
        startDate: '2012-11-01',
        termMonths: 3,
        monthlyNetCents: 100,
      })
    ).toEqual({ ok: false, reason: 'no_vat_rate', dueDate: '2012-11-01' });
  });

  it('throws on an impossible term or amount (bugs in the caller)', () => {
    const base = { contractNumber: 'X', startDate: '2026-11-05', monthlyNetCents: 100 };
    expect(() => rentSchedule(rates, { ...base, termMonths: 0 })).toThrow(RangeError);
    expect(() => rentSchedule(rates, { ...base, termMonths: 12, monthlyNetCents: 1.5 })).toThrow(
      RangeError
    );
  });

  it('builds single lines for other invoice kinds, e.g. a buyout', () => {
    const line = invoiceLine(rates, {
      seq: 37,
      number: invoiceNumber('ML-2026-0001', 37),
      kind: 'buyout',
      periodStart: null,
      periodEnd: null,
      dueDate: '2029-11-05',
      netCents: 58_350,
    });
    expect(line).toMatchObject({
      number: 'ML-2026-0001-037',
      vatCents: 15_171,
      grossCents: 73_521,
    });
    expect(sumInvoices([])).toEqual({ netCents: 0, vatCents: 0, grossCents: 0 });
  });
});

describe('rentSchedule: money that adds up (property tests, thousands of random contracts)', () => {
  const contract = fc.record({
    year: fc.integer({ min: 2025, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
    term: fc.constantFrom(12, 24, 36, 48),
    monthly: fc.integer({ min: 1, max: 600_000 }),
  });

  it('every invoice is consistent and the totals are exact sums', () => {
    fc.assert(
      fc.property(contract, ({ year, month, day, term, monthly }) => {
        const start = formatIsoDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
        const { invoices, totals } = schedule(start, term, monthly);

        expect(invoices).toHaveLength(term);
        expect(totals.netCents).toBe(monthly * term);
        expect(totals.grossCents).toBe(totals.netCents + totals.vatCents);
        expect(totals.grossCents).toBe(invoices.reduce((s, i) => s + i.grossCents, 0));

        invoices.forEach((inv, k) => {
          const rate = vatRateOn(rates, inv.dueDate);
          expect(rate.ok && rate.rateBp).toBe(inv.vatRateBp);
          expect(Number.isInteger(inv.vatCents)).toBe(true);
          expect(
            Math.abs(inv.vatCents * 10_000 - inv.netCents * inv.vatRateBp)
          ).toBeLessThanOrEqual(5_000);
          expect(inv.grossCents).toBe(inv.netCents + inv.vatCents);
          expect(inv.dueDate).toBe(addMonthsClamped(start, k));
          const next = invoices[k + 1];
          if (next) {
            expect(next.dueDate > inv.dueDate).toBe(true);
            expect(inv.periodEnd).toBe(dayBefore(next.periodStart ?? ''));
          }
        });
        parseIsoDate(invoices[term - 1]?.periodEnd ?? '');
      }),
      { numRuns: 2_000 }
    );
    // 2 000 random contracts take ~1 s locally but can pass 5 s on a CI runner with coverage on.
  }, 30_000);
});
