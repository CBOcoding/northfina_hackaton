import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  loadAssets,
  loadCo2Factors,
  loadCoefficientTable,
  loadCustomers,
  loadDataFile,
  loadPriceLists,
  loadQuestions,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
  loadVatRates,
} from './load';
import { coefficientTableSchema, priceListsFileSchema } from './schemas';

describe('data pack', () => {
  it('every file in data/ parses against its schema', async () => {
    const [assets, priceLists, table, curves, vat, questions, customers, demand, refurb, co2] =
      await Promise.all([
        loadAssets(),
        loadPriceLists(),
        loadCoefficientTable(),
        loadResidualCurves(),
        loadVatRates(),
        loadQuestions(),
        loadCustomers(),
        loadSecondLifeDemand(),
        loadRefurbishmentCosts(),
        loadCo2Factors(),
      ]);

    expect(assets).toHaveLength(30);
    expect(priceLists.map((list) => list.version)).toEqual([1, 2]);
    expect(table.bands.map((band) => band.band)).toEqual(['A', 'B', 'C', 'D']);
    expect(curves.curves.e_bike[0]).toEqual([0, 100]);
    expect(vat.country).toBe('FI');
    expect(questions.questions.length).toBeGreaterThan(0);
    expect(customers.length).toBeGreaterThan(0);
    expect(demand.length).toBeGreaterThan(0);
    expect(refurb.laptop.fixed.length).toBeGreaterThan(0);
    expect(co2.manufacturing_new_kg.e_bike).toBeGreaterThan(0);
  });

  it('has a price for every asset in every price list', async () => {
    const [assets, priceLists] = await Promise.all([loadAssets(), loadPriceLists()]);
    for (const list of priceLists) {
      for (const asset of assets) {
        expect(list.prices[asset.id], `${asset.id} in price list ${list.version}`).toBeTypeOf(
          'number'
        );
      }
    }
  });

  it('reports which file and field is wrong when data does not match', async () => {
    const strict = z.array(z.strictObject({ id: z.number() }));
    await expect(loadDataFile('assets.json', strict)).rejects.toThrow(
      /data\/assets\.json does not match its schema/
    );
  });
});

describe('data pack rules enforced by the schemas', () => {
  it('rejects overlapping price lists', () => {
    const list = { note: '', prices: {} };
    const result = priceListsFileSchema.safeParse([
      { ...list, version: 1, valid_from: '2026-01-01', valid_to: '2026-06-30' },
      { ...list, version: 2, valid_from: '2026-06-30', valid_to: null },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects a coefficient table with a gap between bands', async () => {
    const table = await loadCoefficientTable();
    const [first, second, ...rest] = table.bands;
    if (!first || !second) throw new Error('expected at least two bands');
    const withGap = {
      ...table,
      bands: [first, { ...second, min_financed_cents: second.min_financed_cents + 1 }, ...rest],
    };
    expect(coefficientTableSchema.safeParse(withGap).success).toBe(false);
  });
});
