import { beforeAll, describe, expect, it } from 'vitest';
import { loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { vatRateOn } from './vat';

let rates: VatRates;
beforeAll(async () => {
  rates = await loadVatRates();
});

describe('vatRateOn', () => {
  it('uses 25.5 % up to and including 31 Dec 2026', () => {
    expect(vatRateOn(rates, '2026-11-05')).toMatchObject({ ok: true, rateBp: 2_550 });
    expect(vatRateOn(rates, '2026-12-31')).toMatchObject({ ok: true, rateBp: 2_550 });
  });

  it('switches to the fictional 26 % on 1 Jan 2027 and keeps it with no end date', () => {
    expect(vatRateOn(rates, '2027-01-01')).toEqual({
      ok: true,
      rateBp: 2_600,
      validFrom: '2027-01-01',
      fictional: true,
    });
    expect(vatRateOn(rates, '2030-06-30')).toMatchObject({ ok: true, rateBp: 2_600 });
  });

  it('knows the older 24 % rate and its last day', () => {
    expect(vatRateOn(rates, '2024-08-31')).toMatchObject({ ok: true, rateBp: 2_400 });
    expect(vatRateOn(rates, '2024-09-01')).toMatchObject({ ok: true, rateBp: 2_550 });
  });

  it('has no rate before the first entry', () => {
    expect(vatRateOn(rates, '2012-12-31')).toEqual({ ok: false, reason: 'no_rate_on_date' });
  });

  it('throws on a malformed date', () => {
    expect(() => vatRateOn(rates, '1.1.2027')).toThrow(RangeError);
  });
});
