import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { endOfTerm, termEndDate, type EndOfTermContract } from './end-of-term';

let vatRates: VatRates;
beforeAll(async () => {
  vatRates = await loadVatRates();
});

// Card 1: Aino, ebike-003, 36 months from 5 Nov 2026, buyout 15 % of 389 000.
const aino: EndOfTermContract = {
  number: 'ML-2026-0001',
  status: 'active',
  startDate: '2026-11-05',
  termMonths: 36,
  buyoutNetCents: 58_350,
};
const ebike = [{ assetId: 'ebike-003', usageValue: 0 }];

describe('termEndDate', () => {
  it('is start + term months, clamped to the last day of a short month', () => {
    expect(termEndDate('2026-11-05', 36)).toBe('2029-11-05');
    expect(termEndDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(termEndDate('2027-01-31', 13)).toBe('2028-02-29');
  });
});

describe('endOfTerm', () => {
  it('buy: one buyout invoice on the end date, VAT at that day’s rate (26 % in 2029)', () => {
    expect(endOfTerm(vatRates, aino, 'buy', ebike)).toEqual({
      ok: true,
      status: 'bought',
      endedOn: '2029-11-05',
      invoice: {
        seq: 37,
        number: 'ML-2026-0001-037',
        kind: 'buyout',
        periodStart: null,
        periodEnd: null,
        dueDate: '2029-11-05',
        netCents: 58_350,
        vatRateBp: 2600,
        vatCents: 15_171, // 58 350 × 0.26 = 15 171.0
        grossCents: 73_521,
        status: 'issued',
      },
      items: [{ assetId: 'ebike-003', returned: null }],
    });
  });

  it('return: the item comes back with the reported condition and usage, no invoice', () => {
    const result = endOfTerm(vatRates, aino, 'return', [
      { assetId: 'ebike-003', usageValue: 0, report: { condition: 'good', usageValue: 7_200 } },
    ]);
    expect(result).toEqual({
      ok: true,
      status: 'returned',
      endedOn: '2029-11-05',
      invoice: null,
      items: [{ assetId: 'ebike-003', returned: { condition: 'good', usageValue: 7_200 } }],
    });
  });

  it('pass on: same report, the contract says passed_on; equal usage is fine', () => {
    const result = endOfTerm(vatRates, aino, 'pass_on', [
      { assetId: 'ebike-003', usageValue: 500, report: { condition: 'fair', usageValue: 500 } },
    ]);
    expect(result.ok && result.status).toBe('passed_on');
  });

  it('refuses a return without a report, or with less usage than we know', () => {
    expect(endOfTerm(vatRates, aino, 'return', ebike)).toEqual({
      ok: false,
      reason: 'missing_report',
      assetId: 'ebike-003',
    });
    expect(
      endOfTerm(vatRates, aino, 'return', [
        { assetId: 'ebike-003', usageValue: 900, report: { condition: 'good', usageValue: 899 } },
      ])
    ).toEqual({ ok: false, reason: 'usage_went_down', assetId: 'ebike-003' });
  });

  it('only ends an active contract', () => {
    for (const status of ['bought', 'returned', 'passed_on', 'exited_early'] as const) {
      expect(endOfTerm(vatRates, { ...aino, status }, 'buy', ebike)).toEqual({
        ok: false,
        reason: 'not_active',
      });
    }
  });

  it('cannot invoice a buyout on a day without a VAT rate', () => {
    const noRates: VatRates = { ...vatRates, rates: [] };
    expect(endOfTerm(noRates, aino, 'buy', ebike)).toEqual({ ok: false, reason: 'no_vat_rate' });
  });
});
