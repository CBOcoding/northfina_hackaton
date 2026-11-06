// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { VatRates } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { signLease, type LeaseData } from './contracts';
import { endContract } from './end-of-term';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseData;
let vatRates: VatRates;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  const [priceLists, table, rates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  vatRates = rates;
  data = { priceLists, table, vatRates };
});
afterAll(async () => {
  await cleanup();
});

let number: string;
beforeEach(async () => {
  await db.invoice.deleteMany();
  await db.contractAsset.deleteMany();
  await db.contract.deleteMany();
  await db.applicationAsset.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
  const signed = await signLease(db, data, {
    actor: 'test',
    customerId: 'cust-aino',
    signedBy: 'Aino Virtanen',
    items: [{ assetId: 'ebike-003' }],
    quotedOn: '2026-11-05',
    signedOn: '2026-11-05',
    downPaymentCents: 0,
    termMonths: 36,
  });
  if (!signed.ok) throw new Error(signed.reason);
  number = signed.stored.contract.number;
});

describe('endContract', () => {
  it('buy: stores the buyout invoice, ends the contract and writes one audit row', async () => {
    const result = await endContract(db, vatRates, { number, choice: 'buy', actor: 'aino' });
    expect(result.ok).toBe(true);
    const row = await db.contract.findUniqueOrThrow({
      where: { number },
      include: { invoices: { orderBy: { seq: 'asc' } } },
    });
    expect(row).toMatchObject({ status: 'bought', ended_on: '2029-11-05' });
    expect(row.invoices).toHaveLength(37);
    expect(row.invoices.at(-1)).toMatchObject({ kind: 'buyout', net_cents: 58_350 });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset).toMatchObject({ status: 'reserved', previous_lives: 1 });
    const audit = await db.auditLog.findMany({ where: { action: 'contract.bought' } });
    expect(audit).toHaveLength(1);
  });

  it('return: the bike comes back with its report and shows up for a second life', async () => {
    const result = await endContract(db, vatRates, {
      number,
      choice: 'return',
      actor: 'aino',
      reports: { 'ebike-003': { condition: 'good', usageValue: 6_500 } },
    });
    expect(result.ok).toBe(true);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset).toMatchObject({
      status: 'returned',
      condition: 'good',
      usage_value: 6_500,
      previous_lives: 1,
    });
    expect(await db.invoice.count({ where: { kind: 'buyout' } })).toBe(0);
  });

  it('ends a contract only once, and changes nothing when refused', async () => {
    await endContract(db, vatRates, { number, choice: 'buy', actor: 'aino' });
    expect(await endContract(db, vatRates, { number, choice: 'buy', actor: 'aino' })).toEqual({
      ok: false,
      reason: 'not_active',
    });
    expect(await db.auditLog.count({ where: { action: 'contract.bought' } })).toBe(1);
  });

  it('two requests at the same time (double click, two tabs): only one ends the contract', async () => {
    const results = await Promise.all([
      endContract(db, vatRates, { number, choice: 'buy', actor: 'tab-1' }),
      endContract(db, vatRates, {
        number,
        choice: 'return',
        actor: 'tab-2',
        reports: { 'ebike-003': { condition: 'good', usageValue: 100 } },
      }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'not_active' }]);

    const row = await db.contract.findUniqueOrThrow({
      where: { number },
      include: { invoices: { where: { kind: 'buyout' } } },
    });
    // A buyout invoice exists exactly when the contract was bought.
    expect(row.invoices).toHaveLength(row.status === 'bought' ? 1 : 0);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.previous_lives).toBe(1);
    const ends = await db.auditLog.count({
      where: { entity_id: number, action: { not: 'contract.signed' } },
    });
    expect(ends).toBe(1);
  });

  it('refuses a return without a report, writing nothing', async () => {
    const result = await endContract(db, vatRates, { number, choice: 'pass_on', actor: 'aino' });
    expect(result).toEqual({ ok: false, reason: 'missing_report', assetId: 'ebike-003' });
    const row = await db.contract.findUniqueOrThrow({ where: { number } });
    expect(row.status).toBe('active');
  });

  it('says not_found for an unknown contract', async () => {
    expect(
      await endContract(db, vatRates, { number: 'ML-1999-0001', choice: 'buy', actor: 'x' })
    ).toEqual({ ok: false, reason: 'not_found' });
  });
});
