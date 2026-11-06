// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { changeAssetStatus, listAssets, seedAssets, toAsset, toAssetRowData } from './assets';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Asset[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadAssets();
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.invoice.deleteMany();
  await db.contractAsset.deleteMany();
  await db.contract.deleteMany();
  await db.application.deleteMany();
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
});

describe('seedAssets', () => {
  it('inserts every asset from the data pack once', async () => {
    expect(await seedAssets(db, dataPack)).toEqual({ created: 30, skipped: 0 });
    expect(await seedAssets(db, dataPack)).toEqual({ created: 0, skipped: 30 });
    expect(await db.asset.count()).toBe(30);
  });

  it('does not overwrite a status you changed', async () => {
    await seedAssets(db, dataPack);
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'reserved' } });
    await seedAssets(db, dataPack);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status).toBe(
      'reserved'
    );
  });
});

describe('listAssets', () => {
  it('returns assets in the data-pack shape, round-tripping exactly', async () => {
    await seedAssets(db, dataPack);
    const assets = await listAssets(db);
    expect(assets).toEqual([...dataPack].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('filters by category', async () => {
    await seedAssets(db, dataPack);
    const laptops = await listAssets(db, { category: 'laptop' });
    expect(laptops).toHaveLength(10);
    expect(laptops.every((asset) => asset.category === 'laptop')).toBe(true);
  });
});

describe('changeAssetStatus', () => {
  it('updates the status and writes an audit row with from and to', async () => {
    await seedAssets(db, dataPack);

    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'reserved',
      actor: 'team-test',
    });

    expect(result).toMatchObject({ ok: true, asset: { id: 'ebike-001', status: 'reserved' } });
    const audit = await db.auditLog.findFirstOrThrow();
    expect(audit).toMatchObject({ action: 'asset.status_changed', entity_id: 'ebike-001' });
    expect(JSON.parse(audit.details_json ?? '')).toEqual({ from: 'available', to: 'reserved' });
  });

  async function leaseOf(assetId: string, status: string) {
    const app = await db.application.create({
      data: {
        customer_id: 'cust-aino',
        quoted_on: '2026-11-05',
        price_list_version: 1,
        list_price_cents: 1,
        down_payment_cents: 0,
        term_months: 36,
        decision: 'approved',
      },
    });
    await db.contract.create({
      data: {
        number: `ML-2026-${status}`,
        application_id: app.id,
        customer_id: 'cust-aino',
        signed_on: '2026-11-05',
        start_date: '2026-11-05',
        price_list_version: 1,
        list_price_cents: 1,
        down_payment_cents: 0,
        financed_cents: 1,
        band: 'A',
        factor_micro: 1,
        term_months: 36,
        monthly_net_cents: 1,
        buyout_percent: 1,
        buyout_net_cents: 1,
        lock_reason: 'none',
        signed_by: 'Aino',
        status,
        items: {
          create: [{ asset_id: assetId, list_price_cents: 1, quantity: 1, life_number: 1 }],
        },
      },
    });
  }

  it('refuses to change an item in an active contract and writes nothing', async () => {
    await seedAssets(db, dataPack);
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'reserved' } });
    await leaseOf('ebike-001', 'active');

    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'available',
      actor: 'team-test',
    });

    expect(result).toEqual({ ok: false, reason: 'under_contract' });
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status).toBe(
      'reserved'
    );
    expect(await db.auditLog.count()).toBe(0);
  });

  it('changes an item whose contract has ended, recording the status read in the transaction', async () => {
    await seedAssets(db, dataPack);
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'returned' } });
    await leaseOf('ebike-001', 'returned');

    const result = await changeAssetStatus(db, {
      id: 'ebike-001',
      status: 'available',
      actor: 'x',
    });

    expect(result).toMatchObject({ ok: true, asset: { status: 'available' } });
    const audit = await db.auditLog.findFirstOrThrow();
    expect(JSON.parse(audit.details_json ?? '')).toEqual({ from: 'returned', to: 'available' });
  });

  it('answers not_found for an unknown id and writes nothing', async () => {
    const result = await changeAssetStatus(db, { id: 'nope', status: 'reserved', actor: 'x' });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(await db.auditLog.count()).toBe(0);
  });
});

describe('toAsset', () => {
  it('rejects a row with a value the schema does not allow', () => {
    const [first] = dataPack;
    if (!first) throw new Error('empty data pack');
    const row = {
      ...toAssetRowData(first),
      status: 'stolen',
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(() => toAsset(row)).toThrow();
  });
});
