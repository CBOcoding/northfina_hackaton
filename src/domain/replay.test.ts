import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import { rentSchedule } from './invoicing';
import { monthOn, replayAt } from './replay';
import type { InvoiceLine } from './types';

let aino: InvoiceLine[];
let card4: InvoiceLine[];
beforeAll(async () => {
  const rates = await loadVatRates();
  const build = (startDate: string, termMonths: number, monthlyNetCents: number) => {
    const r = rentSchedule(rates, {
      contractNumber: 'ML-T',
      startDate,
      termMonths,
      monthlyNetCents,
    });
    if (!r.ok) throw new Error(r.reason);
    return r.invoices;
  };
  aino = build('2026-11-05', 36, 10_730);
  card4 = build('2026-01-31', 36, 3_432);
});

describe('replayAt', () => {
  it('month 1: one invoice so far, no VAT change', () => {
    expect(replayAt(aino, 1)).toMatchObject({
      month: 1,
      current: { dueDate: '2026-11-05', grossCents: 13_466 },
      invoicedGrossCents: 13_466,
      remainingCount: 35,
      vatChange: null,
    });
  });

  it('month 3 (January 2027): explains the higher invoice with the VAT change, rent unchanged', () => {
    expect(replayAt(aino, 3).vatChange).toEqual({
      fromRateBp: 2_550,
      toRateBp: 2_600,
      since: '2027-01-05',
      grossDifferenceCents: 54,
      netCents: 10_730,
    });
  });

  it('invoiced + remaining always equals the contract total', () => {
    for (let m = 1; m <= 36; m++) {
      const r = replayAt(aino, m);
      expect(r.invoicedGrossCents + r.remainingGrossCents).toBe(486_612);
      expect(r.remainingCount).toBe(36 - m);
    }
  });

  it('clamps months outside the contract', () => {
    expect(replayAt(aino, 0).month).toBe(1);
    expect(replayAt(aino, 99)).toMatchObject({
      month: 36,
      remainingGrossCents: 0,
      remainingCount: 0,
    });
  });

  it('throws on a contract without invoices', () => {
    expect(() => replayAt([], 1)).toThrow(RangeError);
  });
});

describe('monthOn', () => {
  it('finds the latest invoice due on or before a day', () => {
    expect(monthOn(aino, '2026-11-05')).toBe(1);
    expect(monthOn(aino, '2027-01-04')).toBe(2);
    expect(monthOn(aino, '2027-01-05')).toBe(3);
    expect(monthOn(card4, '2028-02-29')).toBe(26);
  });

  it('stays inside the contract before its start and after its end', () => {
    expect(monthOn(aino, '2026-01-01')).toBe(1);
    expect(monthOn(aino, '2035-01-01')).toBe(36);
  });
});
