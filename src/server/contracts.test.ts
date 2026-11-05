// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import {
  getContract,
  listContracts,
  signLease,
  type LeaseData,
  type SignLeaseInput,
} from './contracts';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseData;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  data = { priceLists, table, vatRates };
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.invoice.deleteMany();
  await db.contractAsset.deleteMany();
  await db.contract.deleteMany();
  await db.applicationAsset.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const aino: SignLeaseInput = {
  actor: 'test',
  customerId: 'cust-aino',
  signedBy: 'Aino Virtanen',
  assetIds: ['ebike-003'],
  quotedOn: '2026-11-05',
  signedOn: '2026-11-05',
  downPaymentCents: 0,
  termMonths: 36,
};

async function sign(input: Partial<SignLeaseInput> = {}) {
  const result = await signLease(db, data, { ...aino, ...input });
  if (!result.ok) throw new Error(`expected a contract, got ${result.reason}`);
  return result;
}

describe('signLease: card 1, Aino', () => {
  it('stores the locked contract with 36 invoices that add up', async () => {
    const { stored } = await sign();
    expect(stored.contract).toMatchObject({
      number: 'ML-2026-0001',
      monthlyNetCents: 10_730,
      status: 'active',
    });
    expect(stored.invoices).toHaveLength(36);
    expect(stored.invoices[2]).toMatchObject({
      dueDate: '2027-01-05',
      vatRateBp: 2_600,
      grossCents: 13_520,
    });
    expect(stored.invoices.reduce((s, i) => s + i.grossCents, 0)).toBe(486_612);
    expect(await db.invoice.count()).toBe(36);
  });

  it('reads back exactly what was stored', async () => {
    const { stored } = await sign();
    expect(await getContract(db, 'ML-2026-0001')).toEqual(stored);
    expect(await getContract(db, 'ML-2099-0001')).toBeNull();
  });

  it('writes one audit row, records an approved application and takes the bike off the market', async () => {
    await sign();
    const audit = await db.auditLog.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'contract.signed',
      entity_type: 'contract',
      entity_id: 'ML-2026-0001',
    });
    expect(JSON.parse(audit[0]?.details_json ?? '{}')).toMatchObject({
      assets: ['ebike-003'],
      invoices: 36,
    });
    expect(await db.application.findFirst()).toMatchObject({
      decision: 'approved',
      customer_id: 'cust-aino',
    });
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'reserved'
    );
  });

  it('numbers contracts per year', async () => {
    await sign();
    const second = await sign({ assetIds: ['ebike-012'] });
    expect(second.stored.contract.number).toBe('ML-2026-0002');
    expect((await listContracts(db)).map((c) => c.number)).toEqual([
      'ML-2026-0002',
      'ML-2026-0001',
    ]);
  });
});

describe('signLease: card 2, the price lock', () => {
  it('quoted Thursday on v1, signed Friday on v2: locks 8857/month and says why', async () => {
    const { stored, lock } = await sign({ assetIds: ['laptop-004'], signedOn: '2026-11-06' });
    expect(lock.reason).toBe('price_dropped_since_quote');
    expect(stored.contract).toMatchObject({
      priceListVersion: 2,
      listPriceCents: 321_100,
      monthlyNetCents: 8_857,
    });
  });
});

describe('signLease: refusals store nothing', () => {
  it.each([
    [{ assetIds: ['ebike-009'] }, 'asset_not_available'],
    [{ assetIds: ['nope-001'] }, 'asset_not_found'],
    [{ assetIds: [] }, 'no_items'],
    [{ assetIds: ['ebike-010'] }, 'below_minimum'],
    [{ termMonths: 18 }, 'unknown_term'],
    [{ signedOn: '2026-11-04' }, 'signed_before_quote'],
    [{ quotedOn: '2025-11-05', signedOn: '2025-11-05' }, 'no_price_on_date'],
    [{ applicationId: 'missing' }, 'application_not_found'],
  ] as const)('%o → %s', async (input, reason) => {
    expect(await signLease(db, data, { ...aino, ...input })).toEqual({ ok: false, reason });
    expect(await db.contract.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('cannot lease the same bike twice', async () => {
    await sign();
    expect(await signLease(db, data, aino)).toEqual({ ok: false, reason: 'asset_not_available' });
  });
});

describe('signLease: with an application from the question flow', () => {
  async function application(decision: string) {
    return db.application.create({
      data: {
        customer_id: 'cust-aino',
        quoted_on: '2026-11-05',
        price_list_version: 1,
        list_price_cents: 389_000,
        down_payment_cents: 0,
        term_months: 36,
        decision,
      },
    });
  }

  it('signs an approved application once', async () => {
    const app = await application('approved');
    await sign({ applicationId: app.id });
    expect(await db.application.count()).toBe(1);
    expect(
      await signLease(db, data, { ...aino, assetIds: ['ebike-012'], applicationId: app.id })
    ).toEqual({
      ok: false,
      reason: 'application_already_signed',
    });
  });

  it('refuses an application that is not approved', async () => {
    const app = await application('manual_review');
    expect(await signLease(db, data, { ...aino, applicationId: app.id })).toEqual({
      ok: false,
      reason: 'application_not_approved',
    });
  });
});

describe('signLease: a small fleet', () => {
  it('prices two bikes together and stores both items with their life number', async () => {
    const { stored } = await sign({ assetIds: ['ebike-001', 'ebike-005'] });
    expect(stored.contract.financedCents).toBe(189_900 + 159_000);
    expect(stored.contract.items).toEqual([
      { assetId: 'ebike-001', listPriceCents: 189_900, lifeNumber: 1 },
      { assetId: 'ebike-005', listPriceCents: 159_000, lifeNumber: 2 },
    ]);
    expect((await getContract(db, stored.contract.number))?.contract.items).toEqual(
      stored.contract.items
    );
  });
});
