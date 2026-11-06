// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import {
  getContract,
  getSignableApplication,
  leaseFromApplication,
  listContracts,
  prepareLease,
  signApplication,
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
  items: [{ assetId: 'ebike-003' }],
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
      items: [{ assetId: 'ebike-003', quantity: 1 }],
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
    const second = await sign({ items: [{ assetId: 'ebike-012' }] });
    expect(second.stored.contract.number).toBe('ML-2026-0002');
    expect((await listContracts(db)).map((c) => c.number)).toEqual([
      'ML-2026-0002',
      'ML-2026-0001',
    ]);
  });
});

describe('signLease: card 2, the price lock', () => {
  it('quoted Thursday on v1, signed Friday on v2: locks 8857/month and says why', async () => {
    const { stored, lock } = await sign({
      items: [{ assetId: 'laptop-004' }],
      signedOn: '2026-11-06',
    });
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
    [{ items: [{ assetId: 'ebike-009' }] }, 'asset_not_available'],
    [{ items: [{ assetId: 'nope-001' }] }, 'asset_not_found'],
    [{ items: [] }, 'no_items'],
    [{ items: [{ assetId: 'ebike-010' }] }, 'below_minimum'],
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
      await signLease(db, data, {
        ...aino,
        items: [{ assetId: 'ebike-012' }],
        applicationId: app.id,
      })
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

describe('signLease: card 6, a fleet with a quantity', () => {
  it('Norvi: 4 × ebike-004 is priced on 21 960 € (band C) and stores the quantity', async () => {
    const { stored } = await sign({
      customerId: 'cust-norvi',
      signedBy: 'Authorised signatory, Norvi Logistics Oy',
      items: [{ assetId: 'ebike-004', quantity: 4 }],
    });
    expect(stored.contract).toMatchObject({
      listPriceCents: 2_196_000,
      financedCents: 2_196_000,
      band: 'C',
      monthlyNetCents: 58_993,
      items: [{ assetId: 'ebike-004', listPriceCents: 549_000, quantity: 4, lifeNumber: 1 }],
    });
    expect((await getContract(db, stored.contract.number))?.contract.items[0]?.quantity).toBe(4);
    expect((await listContracts(db))[0]?.items).toEqual([{ assetId: 'ebike-004', quantity: 4 }]);
  });

  it('refuses a duplicate item and a quantity below 1', async () => {
    expect(
      await signLease(db, data, {
        ...aino,
        items: [{ assetId: 'ebike-003' }, { assetId: 'ebike-003' }],
      })
    ).toEqual({ ok: false, reason: 'duplicate_item' });
    expect(
      await signLease(db, data, { ...aino, items: [{ assetId: 'ebike-003', quantity: 0 }] })
    ).toEqual({
      ok: false,
      reason: 'invalid_quantity',
    });
  });
});

describe('signLease: a small fleet', () => {
  it('prices two bikes together and stores both items with their life number', async () => {
    const { stored } = await sign({ items: [{ assetId: 'ebike-001' }, { assetId: 'ebike-005' }] });
    expect(stored.contract.financedCents).toBe(189_900 + 159_000);
    expect(stored.contract.items).toEqual([
      { assetId: 'ebike-001', listPriceCents: 189_900, quantity: 1, lifeNumber: 1 },
      { assetId: 'ebike-005', listPriceCents: 159_000, quantity: 1, lifeNumber: 2 },
    ]);
    expect((await getContract(db, stored.contract.number))?.contract.items).toEqual(
      stored.contract.items
    );
  });
});

describe('signing an application from the question flow', () => {
  async function approvedNorvi(decision = 'approved') {
    return db.application.create({
      data: {
        customer_id: 'cust-norvi',
        quoted_on: '2026-11-05',
        price_list_version: 1,
        list_price_cents: 2_196_000,
        down_payment_cents: 0,
        term_months: 36,
        decision,
        answers_json: JSON.stringify({
          q_can_sign: 'no',
          q_signatory_email: 'ceo@norvi.example.com',
        }),
        items: { create: [{ asset_id: 'ebike-004', list_price_cents: 549_000, quantity: 4 }] },
      },
    });
  }

  it('reads items, quantity and terms from the application, not from the browser', async () => {
    const app = await approvedNorvi();
    const signable = await getSignableApplication(db, app.id);
    expect(signable).toMatchObject({
      customerId: 'cust-norvi',
      items: [{ assetId: 'ebike-004', quantity: 4 }],
      answers: { q_can_sign: 'no' },
      contractNumber: null,
    });
    const result = await signApplication(db, data, {
      applicationId: app.id,
      signedBy: 'ceo@norvi.example.com',
      signedOn: '2026-11-05',
      actor: 'customer',
    });
    expect(result).toMatchObject({
      ok: true,
      stored: {
        contract: { band: 'C', monthlyNetCents: 58_993, signedBy: 'ceo@norvi.example.com' },
      },
    });
    expect((await getSignableApplication(db, app.id))?.contractNumber).toBe('ML-2026-0001');
  });

  it('the preview is exactly what gets stored, and storing nothing until signed', async () => {
    const app = await approvedNorvi();
    const signable = await getSignableApplication(db, app.id);
    if (!signable) throw new Error('missing');
    const preview = await prepareLease(
      db,
      data,
      leaseFromApplication(signable, 'CEO', '2026-11-05')
    );
    expect(await db.contract.count()).toBe(0);
    const signed = await signApplication(db, data, {
      applicationId: app.id,
      signedBy: 'CEO',
      signedOn: '2026-11-05',
      actor: 'customer',
    });
    expect(preview.ok && signed.ok && preview.contract).toEqual(
      signed.ok && signed.stored.contract
    );
  });

  it('refuses an unknown, a rejected or an already signed application', async () => {
    const sign = (applicationId: string) =>
      signApplication(db, data, {
        applicationId,
        signedBy: 'X',
        signedOn: '2026-11-05',
        actor: 'customer',
      });
    expect(await sign('missing')).toEqual({ ok: false, reason: 'application_not_found' });
    expect(await getSignableApplication(db, 'missing')).toBeNull();
    const rejected = await approvedNorvi('rejected');
    expect(await sign(rejected.id)).toEqual({ ok: false, reason: 'application_not_approved' });
    const ok = await approvedNorvi();
    await sign(ok.id);
    await db.asset.update({ where: { id: 'ebike-004' }, data: { status: 'available' } });
    expect(await sign(ok.id)).toEqual({ ok: false, reason: 'application_already_signed' });
  });

  it('treats broken stored answers as none', async () => {
    const app = await approvedNorvi();
    await db.application.update({ where: { id: app.id }, data: { answers_json: '{not json' } });
    expect((await getSignableApplication(db, app.id))?.answers).toEqual({});
  });
});

// better-sqlite3 is synchronous, so a plain Promise.all may not interleave two signs. These
// proxies pause one call until the other request reached a chosen point, making the race real.
function pauseBefore(
  base: PrismaClient,
  model: 'contract' | null,
  method: string,
  gate: () => Promise<unknown>
): PrismaClient {
  const wrap = (target: object, inner: (t: object) => object) =>
    new Proxy(target, {
      get(t, p) {
        const value: unknown = Reflect.get(t, p);
        if (p === method && typeof value === 'function')
          return async (...args: unknown[]) => {
            await gate().catch(() => {});
            return (value as (...a: unknown[]) => unknown).apply(t, args);
          };
        if (model && p === model) return inner(value as object);
        return typeof value === 'function' ? value.bind(t) : value;
      },
    });
  return (model ? wrap(base, (m) => wrap(m, (x) => x)) : wrap(base, (x) => x)) as PrismaClient;
}

/** Resolves for everyone once `n` callers arrived. */
function barrier(n: number) {
  let arrived = 0;
  let open!: () => void;
  const all = new Promise<void>((resolve) => (open = resolve));
  return () => {
    if (++arrived >= n) open();
    return all;
  };
}

/** Both requests prepare (same checks, same number) before either stores. */
function bothPrepareFirst(): [PrismaClient, PrismaClient] {
  const arrive = barrier(2);
  return [
    pauseBefore(db, null, '$transaction', arrive),
    pauseBefore(db, null, '$transaction', arrive),
  ];
}

/** B checks the items before A stores, but numbers its contract after A committed. */
function staggered(
  run: (a: PrismaClient, b: PrismaClient) => [Promise<unknown>, Promise<unknown>]
) {
  let bChecked!: () => void;
  const checked = new Promise<void>((resolve) => (bChecked = resolve));
  let aSettled!: () => void;
  const aDone = new Promise<void>((resolve) => (aSettled = resolve));
  const a = pauseBefore(db, null, '$transaction', () => checked);
  const b = pauseBefore(db, 'contract', 'count', () => {
    bChecked();
    return aDone;
  });
  const [pa, pb] = run(a, b);
  pa.finally(aSettled).catch(() => {});
  return Promise.all([pa, pb]);
}

describe('signing at the same time', () => {
  async function approved(customerId: string, assetId: string) {
    return db.application.create({
      data: {
        customer_id: customerId,
        quoted_on: '2026-11-05',
        price_list_version: 1,
        list_price_cents: 389_000,
        down_payment_cents: 0,
        term_months: 36,
        decision: 'approved',
        items: { create: [{ asset_id: assetId, list_price_cents: 389_000, quantity: 1 }] },
      },
    });
  }
  const signAs = (client: PrismaClient, applicationId: string) =>
    signApplication(client, data, {
      applicationId,
      signedBy: 'X',
      signedOn: '2026-11-05',
      actor: 'customer',
    });

  it('two applications for one bike: one contract, the other is told the bike is gone', async () => {
    const first = await approved('cust-aino', 'ebike-003');
    const second = await approved('cust-norvi', 'ebike-003');
    const results = await staggered((a, b) => [signAs(a, first.id), signAs(b, second.id)]);
    expect(results.map((r) => (r as { ok: boolean }).ok).sort()).toEqual([false, true]);
    expect(results).toContainEqual({ ok: false, reason: 'asset_not_available' });
    expect(await db.contract.count()).toBe(1);
    expect(await db.invoice.count()).toBe(36);
    expect(await db.auditLog.count({ where: { action: 'contract.signed' } })).toBe(1);
    expect((await db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } })).status).toBe(
      'reserved'
    );
  });

  it('one application signed twice at once: once, and the second is told so', async () => {
    const app = await approved('cust-aino', 'ebike-003');
    const [a, b] = bothPrepareFirst();
    const results = await Promise.all([signAs(a, app.id), signAs(b, app.id)]);
    expect(results.map((r) => r.ok).sort()).toEqual([false, true]);
    expect(results).toContainEqual({ ok: false, reason: 'application_already_signed' });
    expect(await db.contract.count()).toBe(1);
  });

  it('two unrelated signs at once both succeed with their own number', async () => {
    const [a, b] = bothPrepareFirst();
    const results = await Promise.all([
      signLease(a, data, aino),
      signLease(b, data, { ...aino, items: [{ assetId: 'ebike-012' }] }),
    ]);
    expect(results.map((r) => r.ok && r.stored.contract.number).sort()).toEqual([
      'ML-2026-0001',
      'ML-2026-0002',
    ]);
    expect(await db.invoice.count()).toBe(72);
  });

  it('a returned bike leased again twice at once: one second life only', async () => {
    const second: SignLeaseInput = {
      ...aino,
      items: [{ assetId: 'ebike-008' }],
      secondLife: { priceCents: 120_000, conditionAfter: 'good', usageAfter: 9_800 },
    };
    const results = await staggered((a, b) => [
      signLease(a, data, second),
      signLease(b, data, { ...second, customerId: 'cust-norvi' }),
    ]);
    expect(results).toContainEqual({ ok: false, reason: 'asset_not_available' });
    expect(results.filter((r) => (r as { ok: boolean }).ok)).toHaveLength(1);
    expect(await db.contractAsset.count({ where: { asset_id: 'ebike-008' } })).toBe(1);
  });
});
