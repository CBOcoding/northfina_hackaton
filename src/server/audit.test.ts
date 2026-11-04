// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { listAuditLog, withAudit, type AuditEntry } from './audit';
import type { PrismaClient } from './prisma-client';

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
  await db.asset.deleteMany();
  await db.asset.create({
    data: {
      id: 'ebike-001',
      category: 'e_bike',
      make: 'Kettu Bikes',
      model: 'Urban 1',
      model_year: 2026,
      serial_number: 'LL-EB-240000',
      condition: 'new',
      usage_unit: 'km',
      usage_value: 0,
      previous_lives: 0,
      status: 'available',
    },
  });
});

const entry: AuditEntry = {
  actor: 'team-test',
  action: 'asset.status_changed',
  entityType: 'asset',
  entityId: 'ebike-001',
  details: { from: 'available', to: 'reserved' },
};

const reserve = (tx: Parameters<Parameters<typeof withAudit>[2]>[0]) =>
  tx.asset.update({ where: { id: 'ebike-001' }, data: { status: 'reserved' } });

async function currentStatus() {
  return (await db.asset.findUniqueOrThrow({ where: { id: 'ebike-001' } })).status;
}

describe('withAudit', () => {
  it('commits the change and the audit row together', async () => {
    const updated = await withAudit(db, entry, reserve);

    expect(updated.status).toBe('reserved');
    expect(await currentStatus()).toBe('reserved');
    const rows = await db.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor: 'team-test',
      action: 'asset.status_changed',
      entity_type: 'asset',
      entity_id: 'ebike-001',
      details_json: '{"from":"available","to":"reserved"}',
    });
  });

  it('stores no details as null', async () => {
    await withAudit(db, { ...entry, details: undefined }, reserve);
    expect((await db.auditLog.findFirstOrThrow()).details_json).toBeNull();
  });

  it('rolls back the change when the audit write fails', async () => {
    // A missing actor makes the AuditLog insert fail inside the transaction.
    const broken = { ...entry, actor: undefined as unknown as string };

    await expect(withAudit(db, broken, reserve)).rejects.toThrow();

    expect(await currentStatus()).toBe('available');
    expect(await db.auditLog.count()).toBe(0);
  });

  it('writes no audit row when the change itself fails', async () => {
    await expect(
      withAudit(db, entry, async (tx) => {
        await reserve(tx);
        throw new Error('business rule broken after the write');
      })
    ).rejects.toThrow('business rule broken');

    expect(await currentStatus()).toBe('available');
    expect(await db.auditLog.count()).toBe(0);
  });
});

describe('listAuditLog', () => {
  it('returns the newest rows first with details parsed from JSON', async () => {
    await withAudit(db, entry, reserve);
    await withAudit(db, { ...entry, details: { from: 'reserved', to: 'returned' } }, (tx) =>
      tx.asset.update({ where: { id: 'ebike-001' }, data: { status: 'returned' } })
    );

    const log = await listAuditLog(db);

    expect(log.map((row) => row.details)).toEqual([
      { from: 'reserved', to: 'returned' },
      { from: 'available', to: 'reserved' },
    ]);
    expect(Date.parse(log[0]?.created_at ?? '')).not.toBeNaN();
  });

  it('respects the limit', async () => {
    await withAudit(db, entry, reserve);
    await withAudit(db, entry, reserve);
    expect(await listAuditLog(db, 1)).toHaveLength(1);
  });
});
