// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Customer } from '@/data/schemas';
import { answersFromCustomer } from '@/domain/application';
import { createTestDb } from '../../tests/helpers/test-db';
import { createApplication, type ApplicationInput } from './applications';
import { seedAssets } from './assets';
import type { PrismaClient } from './prisma-client';
import type { TransactionClient as TxClient } from './audit';

const TODAY = '2026-11-05';
let db: PrismaClient;
let cleanup: () => Promise<void>;
let customers: Customer[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  customers = await loadCustomers();
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

// The answers a complete form would send: the persona's, plus the deal questions it has no fact for.
const input = (over: Partial<ApplicationInput>): ApplicationInput => {
  const customerId = over.customerId ?? 'cust-aino';
  return {
    customerId,
    items: [{ assetId: 'ebike-001', quantity: 1 }],
    termMonths: 24,
    downPaymentCents: 0,
    ...over,
    answers: {
      ...answersFromCustomer(customers.find((c) => c.id === customerId) ?? customers[0]!),
      q_usage_purpose: 'commuting',
      q_signatory_email: 'boss@example.com',
      q_farm_registry: 'FI-1234',
      q_pep_details: 'Municipal councillor',
      ...over.answers,
    },
  };
};

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

  it('card 6 (corrected): Norvi, 1 x ebike-004, waits for the signatory whose email it saved', async () => {
    const out = await submit({
      customerId: 'cust-norvi',
      items: [{ assetId: 'ebike-004', quantity: 1 }],
    });
    expect(out.decision).toBe('pending');
    expect(out.reasons.map((r) => r.code)).toEqual(['SIGNATORY_REQUIRED']);
    const row = await db.application.findUniqueOrThrow({ where: { id: out.applicationId } });
    const answers = JSON.parse(row.answers_json) as Record<string, unknown>;
    expect(answers.q_can_sign).toBe('no');
    expect(typeof answers.q_signatory_email).toBe('string');
  });

  it('card 6: Norvi answering "yes" without a signatory email -> missing_answers, nothing saved', async () => {
    const full = input({
      customerId: 'cust-norvi',
      items: [{ assetId: 'ebike-004', quantity: 1 }],
      answers: { q_can_sign: 'yes' },
    });
    const { q_signatory_email: _email, ...answers } = full.answers as Record<string, unknown>;
    const result = await createApplication(db, { ...full, answers: answers as never }, TODAY);
    expect(result).toMatchObject({ ok: false, reason: 'missing_answers' });
    expect(result.ok === false && result.reason === 'missing_answers' && result.ids).toContain(
      'q_signatory_email'
    );
    expect(await db.application.count()).toBe(0);
  });

  it('card 6: Norvi answering "yes" with an email waits for the signatory; the record says "no"', async () => {
    const out = await submit({
      customerId: 'cust-norvi',
      items: [{ assetId: 'ebike-004', quantity: 1 }],
      answers: { q_can_sign: 'yes', q_signatory_email: 'board@norvi.example.com' },
    });
    expect(out.decision).toBe('pending');
    expect(out.reasons.map((r) => r.code)).toEqual(['SIGNATORY_REQUIRED']);
    const row = await db.application.findUniqueOrThrow({ where: { id: out.applicationId } });
    expect(JSON.parse(row.answers_json)).toMatchObject({
      q_can_sign: 'no',
      q_signatory_email: 'board@norvi.example.com',
    });
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

  it('refuses a down payment above the cap the quote screen offers, accepts the cap itself', async () => {
    // ebike-001 at 1 899 €: half is 949,50 €, in 50 € steps 900 €.
    expect(await createApplication(db, input({ downPaymentCents: 500_000 }), TODAY)).toEqual({
      ok: false,
      reason: 'down_payment_too_high',
      maxCents: 90_000,
    });
    expect(await createApplication(db, input({ downPaymentCents: 90_001 }), TODAY)).toMatchObject({
      reason: 'down_payment_too_high',
    });
    expect(await db.application.count()).toBe(0);
    expect((await submit({ downPaymentCents: 90_000 })).decision).toBe('approved');
  });

  it('rejects with FINANCED_OUT_OF_RANGE and no quote when the amount is below the smallest lease', async () => {
    // ebike-010 at 289 €, under band A's 300 € minimum.
    const out = await submit({ items: [{ assetId: 'ebike-010', quantity: 1 }] });
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

  it('D1: Sanna, ebike-004, 12 months, income from her persona (900 EUR) -> AFFORDABILITY_EXCEEDED', async () => {
    const out = await submit({
      customerId: 'cust-sanna',
      items: [{ assetId: 'ebike-004', quantity: 1 }],
      termMonths: 12,
    });
    expect(out.decision).toBe('rejected');
    expect(out.reasons.map((r) => r.code)).toEqual(['AFFORDABILITY_EXCEEDED']);
  });

  it('D1: the same request without income -> missing_answers [q_monthly_income], nothing saved', async () => {
    const full = input({
      customerId: 'cust-sanna',
      items: [{ assetId: 'ebike-004', quantity: 1 }],
      termMonths: 12,
    });
    const { q_monthly_income: _income, ...answers } = full.answers as Record<string, unknown>;
    expect(await createApplication(db, { ...full, answers: answers as never }, TODAY)).toEqual({
      ok: false,
      reason: 'missing_answers',
      ids: ['q_monthly_income'],
    });
    const wrongType = { ...full, answers: { ...answers, q_monthly_income: 'lots' } };
    expect(await createApplication(db, wrongType, TODAY)).toMatchObject({
      reason: 'missing_answers',
      ids: ['q_monthly_income'],
    });
    expect(await db.application.count()).toBe(0);
  });

  it('D2: Mikko answering an adult birth date is still MIN_AGE (saved answers show the record)', async () => {
    const out = await submit({
      customerId: 'cust-mikko',
      items: [{ assetId: 'laptop-008', quantity: 1 }],
      answers: { q_birth_date: '2000-01-01', q_country: 'SE' },
    });
    expect(out.decision).toBe('rejected');
    expect(out.reasons.map((r) => r.code)).toContain('MIN_AGE');
    const row = await db.application.findUniqueOrThrow({ where: { id: out.applicationId } });
    const mikko = customers.find((c) => c.id === 'cust-mikko')!;
    expect(JSON.parse(row.answers_json)).toMatchObject({
      q_birth_date: mikko.type === 'company' ? undefined : mikko.birth_date,
      q_customer_type: 'consumer',
    });
  });

  it('D2: Norvi answering sole_trader still SIGNATORY_REQUIRED', async () => {
    const out = await submit({
      customerId: 'cust-norvi',
      items: [{ assetId: 'ebike-004', quantity: 4 }],
      answers: { q_customer_type: 'sole_trader', q_birth_date: '1980-01-01' },
    });
    expect(out.decision).toBe('pending');
    expect(out.reasons.map((r) => r.code)).toContain('SIGNATORY_REQUIRED');
  });

  it('D5: no list price on the day -> price_not_available (a value, not a throw)', async () => {
    expect(await createApplication(db, input({}), '1999-01-01')).toEqual({
      ok: false,
      reason: 'price_not_available',
      id: 'ebike-001',
    });
    expect(await db.application.count()).toBe(0);
  });

  it('D6: items of two categories -> mixed_categories', async () => {
    const mixed = input({
      items: [
        { assetId: 'ebike-001', quantity: 1 },
        { assetId: 'laptop-008', quantity: 1 },
      ],
    });
    expect(await createApplication(db, mixed, TODAY)).toEqual({
      ok: false,
      reason: 'mixed_categories',
    });
    expect(await db.application.count()).toBe(0);
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
    // no id echoed back to the client
    expect(await createApplication(db, input({ customerId: 'zzz' }), TODAY)).toEqual({
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
