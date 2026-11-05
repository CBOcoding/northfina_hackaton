// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { createApplication, type ApplicationInput } from './applications';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import type { TransactionClient as TxClient } from './audit';

const TODAY = '2026-11-05';
let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.application.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, await loadAssets());
});

const input = (over: Partial<ApplicationInput>): ApplicationInput => ({
  customerId: 'cust-aino',
  items: [{ assetId: 'ebike-001', quantity: 1 }],
  termMonths: 24,
  downPaymentCents: 0,
  answers: {},
  ...over,
});

async function submit(over: Partial<ApplicationInput>) {
  const r = await createApplication(db, input(over), TODAY);
  if (!r.ok) throw new Error(r.reason);
  return r.outcome;
}

describe('createApplication', () => {
  it('card 5: Mikko (17) asking for laptop-008 is rejected with MIN_AGE', async () => {
    const out = await submit({
      customerId: 'cust-mikko',
      items: [{ assetId: 'laptop-008', quantity: 1 }],
    });
    expect(out.decision).toBe('rejected');
    expect(out.reasons.map((r) => r.code)).toContain('MIN_AGE');
    expect(await db.application.count()).toBe(1);
  });

  it('card 6: Norvi, 4 x ebike-004, is pending SIGNATORY_REQUIRED and saves quantity 4', async () => {
    const out = await submit({
      customerId: 'cust-norvi',
      items: [{ assetId: 'ebike-004', quantity: 4 }],
    });
    expect(out.decision).toBe('pending');
    expect(out.reasons.map((r) => r.code)).toContain('SIGNATORY_REQUIRED');
    expect(out.quote).not.toBeNull();
    expect(out.monthlyGrossCents).toBeGreaterThan(out.quote!.monthlyNetCents);
    const row = await db.application.findUniqueOrThrow({
      where: { id: out.applicationId },
      include: { items: true },
    });
    expect(row.items).toHaveLength(1);
    expect(row.items[0]!.quantity).toBe(4);
    expect(row.list_price_cents).toBe(row.items[0]!.list_price_cents * 4);
    expect(row.quoted_on).toBe(TODAY);
  });

  it('card 7: Haapala, farm-002, 48 months, 20 000 EUR down, goes to manual review (PEP)', async () => {
    const out = await submit({
      customerId: 'cust-haapala',
      items: [{ assetId: 'farm-002', quantity: 1 }],
      termMonths: 48,
      downPaymentCents: 2_000_000,
    });
    expect(out.decision).toBe('manual_review');
    expect(out.reasons.map((r) => r.code)).toContain('PEP_MANUAL_REVIEW');
  });

  it('rejects with FINANCED_OUT_OF_RANGE and no quote when the down payment leaves too little', async () => {
    const out = await submit({ downPaymentCents: 10_000_000 });
    expect(out.decision).toBe('rejected');
    expect(out.reasons.map((r) => r.code)).toContain('FINANCED_OUT_OF_RANGE');
    expect(out.quote).toBeNull();
    expect(out.monthlyGrossCents).toBeNull();
  });

  it('prunes answers on the server and reports what it dropped', async () => {
    const out = await submit({ answers: { q_pep: 'yes', q_nonsense: 'x' } });
    expect(out.droppedAnswers).toEqual(expect.arrayContaining(['q_pep', 'q_nonsense']));
    const row = await db.application.findUniqueOrThrow({ where: { id: out.applicationId } });
    expect(JSON.parse(row.answers_json)).not.toHaveProperty('q_pep');
  });

  it('reserved asset -> asset_not_available; missing asset or customer -> refused; nothing saved', async () => {
    await db.asset.update({ where: { id: 'ebike-001' }, data: { status: 'reserved' } });
    expect(await createApplication(db, input({}), TODAY)).toEqual({
      ok: false,
      reason: 'asset_not_available',
      id: 'ebike-001',
    });
    expect(
      await createApplication(db, input({ items: [{ assetId: 'nope', quantity: 1 }] }), TODAY)
    ).toMatchObject({ ok: false, reason: 'asset_not_found' });
    expect(await createApplication(db, input({ customerId: 'zzz' }), TODAY)).toMatchObject({
      ok: false,
      reason: 'unknown_customer',
    });
    expect(await db.application.count()).toBe(0);
  });

  it('writes the audit row in the same tx; a failing audit write leaves no application', async () => {
    const out = await submit({});
    const rows = await db.auditLog.findMany({ where: { action: 'application.submitted' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.entity_id).toBe(out.applicationId);

    // Same database, but the audit insert inside the transaction fails.
    const failing = new Proxy(db, {
      get(target, prop) {
        const value = Reflect.get(target, prop);
        if (prop !== '$transaction')
          return typeof value === 'function' ? value.bind(target) : value;
        return (fn: (tx: TxClient) => Promise<unknown>) =>
          target.$transaction((tx) =>
            fn(
              new Proxy(tx, {
                get: (t, p) =>
                  p === 'auditLog'
                    ? { create: () => Promise.reject(new Error('boom')) }
                    : Reflect.get(t, p),
              }) as TxClient
            )
          );
      },
    });
    await expect(createApplication(failing, input({}), TODAY)).rejects.toThrow('boom');
    expect(await db.application.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
  });
});
