// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { getContract } from './contracts';
import type { PrismaClient } from './prisma-client';
import { leaseSecondLife } from './second-life';

const TODAY = '2026-11-06';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
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

describe('leaseSecondLife', () => {
  it('card 10: ebike-008 (2 lives) goes to wait-05 as life 3 at the second-life price', async () => {
    const result = await leaseSecondLife(db, { assetId: 'ebike-008', today: TODAY, actor: 'test' });
    expect(result).toMatchObject({ ok: true, waitingListId: 'wait-05', lifeNumber: 3 });
    if (!result.ok) return;

    const stored = await getContract(db, result.number);
    expect(stored?.contract).toMatchObject({
      customerId: 'wait-05',
      listPriceCents: 34_232, // market value after the work, not the 1 889 € list price
      termMonths: 12,
      monthlyNetCents: 1_918, // 342,32 € × 0.056022 (band A, 12 months)
      lockReason: 'same_day',
    });
    expect(stored?.contract.items).toEqual([
      { assetId: 'ebike-008', listPriceCents: 34_232, quantity: 1, lifeNumber: 3 },
    ]);
    expect(stored?.invoices).toHaveLength(12);

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-008' } });
    expect(asset.status).toBe('reserved');

    const audit = await db.auditLog.findMany({ where: { entity_id: result.number } });
    expect(audit.map((a) => a.action)).toEqual(['contract.signed']);
  });

  it('card 9: ebike-007 goes to wait-13 and leaves in the condition after the repair', async () => {
    const result = await leaseSecondLife(db, { assetId: 'ebike-007', today: TODAY, actor: 'test' });
    expect(result).toMatchObject({ ok: true, waitingListId: 'wait-13', lifeNumber: 2 });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-007' } });
    expect(asset.condition).toBe('good');
    expect(asset.usage_value).toBe(0); // new battery resets the wear
  });

  it('a served person leaves the waiting list: ebike-011 goes to someone else than ebike-007', async () => {
    const first = await leaseSecondLife(db, { assetId: 'ebike-007', today: TODAY, actor: 'test' });
    expect(first).toMatchObject({ ok: true, waitingListId: 'wait-13' });
    const second = await leaseSecondLife(db, { assetId: 'ebike-011', today: TODAY, actor: 'test' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Alone, ebike-011 would also go to wait-13; served, they leave the list.
    expect(second.waitingListId).toBe('wait-03');
    const customers = await db.contract.findMany({ select: { customer_id: true } });
    expect(new Set(customers.map((c) => c.customer_id)).size).toBe(2);
  });

  it('refuses an item that is not back with us, and a second signing of the same item', async () => {
    expect(
      await leaseSecondLife(db, { assetId: 'ebike-003', today: TODAY, actor: 'test' })
    ).toEqual({ ok: false, reason: 'not_returned' });
    expect(await leaseSecondLife(db, { assetId: 'nope', today: TODAY, actor: 'test' })).toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
    await leaseSecondLife(db, { assetId: 'ebike-008', today: TODAY, actor: 'test' });
    expect(
      await leaseSecondLife(db, { assetId: 'ebike-008', today: TODAY, actor: 'test' })
    ).toEqual({ ok: false, reason: 'not_returned' });
    expect(await db.contract.count()).toBe(1);
  });
});
