import { beforeAll, describe, expect, it } from 'vitest';
import { loadPriceLists } from '@/data/load';
import type { PriceList } from '@/data/schemas';
import { listPriceOn } from './price-list';

let priceLists: PriceList[];
beforeAll(async () => {
  priceLists = await loadPriceLists();
});

describe('listPriceOn', () => {
  it('uses price list 1 up to and including its last day, 2026-11-05', () => {
    expect(listPriceOn(priceLists, 'ebike-001', '2026-11-05')).toEqual({
      ok: true,
      priceCents: 189_900,
      priceListVersion: 1,
    });
  });

  it('switches to price list 2 on 2026-11-06', () => {
    expect(listPriceOn(priceLists, 'ebike-001', '2026-11-06')).toEqual({
      ok: true,
      priceCents: 199_400,
      priceListVersion: 2,
    });
  });

  it('applies price list 1 from its first day', () => {
    expect(listPriceOn(priceLists, 'laptop-002', '2026-01-01')).toMatchObject({
      ok: true,
      priceListVersion: 1,
    });
  });

  it('keeps using the open-ended list 2 far in the future', () => {
    expect(listPriceOn(priceLists, 'farm-002', '2030-01-01')).toEqual({
      ok: true,
      priceCents: 14_500_000,
      priceListVersion: 2,
    });
  });

  it('has no price before the first list starts', () => {
    expect(listPriceOn(priceLists, 'ebike-001', '2025-12-31')).toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
  });

  it('does not know assets that are not in the price list', () => {
    expect(listPriceOn(priceLists, 'ebike-999', '2026-11-05')).toEqual({
      ok: false,
      reason: 'unknown_asset',
    });
  });

  it('works without any price lists', () => {
    expect(listPriceOn([], 'ebike-001', '2026-11-05')).toEqual({
      ok: false,
      reason: 'no_price_list_on_date',
    });
  });

  it('throws on a date that is not YYYY-MM-DD, because that is a bug in the caller', () => {
    expect(() => listPriceOn(priceLists, 'ebike-001', '6.11.2026')).toThrow(RangeError);
  });
});
