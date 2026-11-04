import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { monthlyFactorFor } from './coefficient';

// Tests run against the real data pack, so they also catch a changed data file.
let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

describe('monthlyFactorFor', () => {
  it('picks band A and the 24-month factor for a typical e-bike', () => {
    const result = monthlyFactorFor(table, 189_900, 24);
    expect(result).toMatchObject({ ok: true, factor: 0.036637, band: { band: 'A' } });
  });

  it('keeps 199 999 cents in band A and moves 200 000 cents to band B', () => {
    expect(monthlyFactorFor(table, 199_999, 36)).toMatchObject({ ok: true, band: { band: 'A' } });
    expect(monthlyFactorFor(table, 200_000, 36)).toMatchObject({ ok: true, band: { band: 'B' } });
  });

  it('accepts both ends of the whole table', () => {
    expect(monthlyFactorFor(table, 30_000, 12)).toMatchObject({ ok: true, band: { band: 'A' } });
    expect(monthlyFactorFor(table, 25_000_000, 48)).toMatchObject({
      ok: true,
      band: { band: 'D' },
      factor: 0.021763,
    });
  });

  it('rejects amounts below 300 €', () => {
    expect(monthlyFactorFor(table, 29_999, 24)).toEqual({ ok: false, reason: 'below_minimum' });
    expect(monthlyFactorFor(table, 0, 24)).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('rejects amounts above 250 000 €', () => {
    expect(monthlyFactorFor(table, 25_000_001, 24)).toEqual({
      ok: false,
      reason: 'above_maximum',
    });
  });

  it('rejects a term that is not in the table', () => {
    expect(monthlyFactorFor(table, 189_900, 18)).toEqual({ ok: false, reason: 'unknown_term' });
    expect(monthlyFactorFor(table, 189_900, 0)).toEqual({ ok: false, reason: 'unknown_term' });
  });

  it('reports the amount problem before the term problem', () => {
    expect(monthlyFactorFor(table, 100, 18)).toEqual({ ok: false, reason: 'below_minimum' });
  });

  it('throws on fractions of a cent, because that is a bug in the caller', () => {
    expect(() => monthlyFactorFor(table, 1999.5, 24)).toThrow(RangeError);
  });
});
