import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { leaseOffer } from './catalogue';

let table: CoefficientTable;
beforeAll(async () => {
  table = await loadCoefficientTable();
});

describe('leaseOffer', () => {
  it('flags 29 999 as too cheap and accepts 30 000', () => {
    expect(leaseOffer(29_999, table)).toEqual({ kind: 'too_cheap', minCents: 30_000 });
    expect(leaseOffer(30_000, table)).toEqual({ kind: 'leasable' });
  });

  it('accepts 25 000 000 and asks 1 cent of down payment for 25 000 001', () => {
    expect(leaseOffer(25_000_000, table)).toEqual({ kind: 'leasable' });
    expect(leaseOffer(25_000_001, table)).toEqual({ kind: 'needs_down_payment', minDownCents: 1 });
  });

  it('asks price minus the maximum as down payment', () => {
    expect(leaseOffer(30_000_000, table)).toEqual({
      kind: 'needs_down_payment',
      minDownCents: 5_000_000,
    });
  });

  it('reads the limits from the table, not from constants', () => {
    const small = {
      ...table,
      bands: [{ ...table.bands[0]!, min_financed_cents: 100, max_financed_cents: 500 }],
    };
    expect(leaseOffer(99, small)).toEqual({ kind: 'too_cheap', minCents: 100 });
    expect(leaseOffer(501, small)).toEqual({ kind: 'needs_down_payment', minDownCents: 1 });
  });

  it('throws on fractional cents', () => {
    expect(() => leaseOffer(100.5, table)).toThrow(RangeError);
  });
});
