// Card 6: the applicant cannot sign for the company, so the contract waits for the
// authorised signatory, who then signs it. Runs against a real, migrated SQLite database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { answersFromCustomer } from '@/domain/application';
import { createTestDb } from '../../tests/helpers/test-db';
import { createApplication } from './applications';
import { seedAssets } from './assets';
import {
  getSignableApplication,
  isSignable,
  loadLeaseData,
  signApplication,
  type LeaseData,
} from './contracts';
import type { PrismaClient } from './prisma-client';

const TODAY = '2026-11-06';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let data: LeaseData;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  data = await loadLeaseData();
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

async function norviApplies(canSign: 'yes' | 'no') {
  const norvi = (await loadCustomers()).find((c) => c.id === 'cust-norvi')!;
  const result = await createApplication(
    db,
    {
      customerId: 'cust-norvi',
      items: [{ assetId: 'ebike-004', quantity: 1 }],
      termMonths: 36,
      downPaymentCents: 0,
      answers: {
        ...answersFromCustomer(norvi),
        q_can_sign: canSign,
        q_signatory_email: 'ceo@norvi.example.com',
        q_usage_purpose: 'delivery',
        q_company_name: 'Norvi Logistics Oy',
        q_email: 'fleet@norvi.example.com',
        q_vat_registered: 'yes',
        q_pep: 'no',
      },
    },
    TODAY
  );
  if (!result.ok) throw new Error(result.reason);
  return result.outcome.applicationId;
}

describe('isSignable', () => {
  it('approved, or pending only for the signatory', () => {
    expect(isSignable({ decision: 'approved', reasons: [] })).toBe(true);
    expect(isSignable({ decision: 'pending', reasons: ['SIGNATORY_REQUIRED'] })).toBe(true);
    expect(isSignable({ decision: 'pending', reasons: [] })).toBe(false);
    expect(isSignable({ decision: 'manual_review', reasons: ['SIGNATORY_REQUIRED'] })).toBe(false);
    expect(isSignable({ decision: 'pending', reasons: ['SIGNATORY_REQUIRED', 'X'] })).toBe(false);
    expect(isSignable({ decision: 'rejected', reasons: ['MIN_AGE'] })).toBe(false);
  });
});

describe('card 6: Norvi, 1 × ebike-004, applicant cannot sign', () => {
  it('waits for the signatory, then the signatory signs and the contract is stored', async () => {
    const id = await norviApplies('no');
    const application = await getSignableApplication(db, id);
    expect(application).toMatchObject({ decision: 'pending', reasons: ['SIGNATORY_REQUIRED'] });
    expect(application?.answers.q_signatory_email).toBe('ceo@norvi.example.com');

    const signed = await signApplication(db, data, {
      applicationId: id,
      signedBy: 'ceo@norvi.example.com',
      signedOn: TODAY,
      actor: 'ceo@norvi.example.com',
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    expect(signed.stored.contract).toMatchObject({
      customerId: 'cust-norvi',
      signedBy: 'ceo@norvi.example.com',
      items: [expect.objectContaining({ assetId: 'ebike-004', quantity: 1 })],
    });
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-004' } });
    expect(asset.status).toBe('reserved');
  });
});
