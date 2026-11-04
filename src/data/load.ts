// Typed loaders for the read-only data pack in data/. Server-side only (they read files).
// Each loader reads one JSON file and checks it against its schema in ./schemas.ts,
// so a typo in the data fails loudly here instead of deep inside your pricing code.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  assetsFileSchema,
  co2FactorsSchema,
  coefficientTableSchema,
  customersFileSchema,
  priceListsFileSchema,
  questionsFileSchema,
  refurbishmentCostsSchema,
  residualCurvesSchema,
  secondLifeDemandFileSchema,
  vatRatesSchema,
} from './schemas';

/** The data pack folder: `data/` at the repository root. */
const DATA_DIR = path.join(process.cwd(), 'data');

/** Reads `data/<fileName>` and returns it parsed and validated. Throws if it does not match. */
export async function loadDataFile<S extends z.ZodType>(
  fileName: string,
  schema: S
): Promise<z.output<S>> {
  const text = await readFile(path.join(DATA_DIR, fileName), 'utf8');
  const result = schema.safeParse(JSON.parse(text));
  if (!result.success) {
    throw new Error(
      `data/${fileName} does not match its schema:\n${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}

export const loadAssets = () => loadDataFile('assets.json', assetsFileSchema);
export const loadPriceLists = () => loadDataFile('price-lists.json', priceListsFileSchema);
export const loadCoefficientTable = () =>
  loadDataFile('coefficient-table.json', coefficientTableSchema);
export const loadResidualCurves = () => loadDataFile('residual-curves.json', residualCurvesSchema);
export const loadVatRates = () => loadDataFile('vat-rates.json', vatRatesSchema);
export const loadQuestions = () => loadDataFile('questions.json', questionsFileSchema);
export const loadCustomers = () => loadDataFile('customers.json', customersFileSchema);
export const loadSecondLifeDemand = () =>
  loadDataFile('second-life-demand.json', secondLifeDemandFileSchema);
export const loadRefurbishmentCosts = () =>
  loadDataFile('refurbishment-costs.json', refurbishmentCostsSchema);
export const loadCo2Factors = () => loadDataFile('co2-factors.json', co2FactorsSchema);
