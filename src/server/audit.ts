// Audit trail: every change to business data writes an AuditLog row in the SAME database
// transaction as the change. If either write fails, both are rolled back, so the database
// can never hold a change that nobody can explain.
import type { Prisma, PrismaClient } from '@/generated/prisma/client';

export type AuditEntry = {
  /** Who did it (a user id or name; there is no login in the starter). */
  actor: string;
  /** What happened, as `<entity>.<verb>`, e.g. `asset.status_changed`. */
  action: string;
  entityType: string;
  entityId: string;
  /** Anything useful for a later reader, e.g. `{ from: 'available', to: 'reserved' }`. Stored as JSON. */
  details?: unknown;
};

export type TransactionClient = Prisma.TransactionClient;

/**
 * Runs `work` inside a transaction and records `entry` in the audit log.
 * Use the `tx` you are given for every write in `work`; writes through `db` would
 * escape the transaction.
 *
 *   const asset = await withAudit(db, { actor, action: 'asset.status_changed', ... },
 *     (tx) => tx.asset.update({ where: { id }, data: { status } }));
 */
export async function withAudit<T>(
  db: PrismaClient,
  entry: AuditEntry,
  work: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  return db.$transaction(async (tx) => {
    const result = await work(tx);
    await tx.auditLog.create({
      data: {
        actor: entry.actor,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        details_json: entry.details === undefined ? null : JSON.stringify(entry.details),
      },
    });
    return result;
  });
}

export type AuditLogEntry = {
  id: number;
  created_at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: unknown;
};

/** The newest audit rows first. */
export async function listAuditLog(db: PrismaClient, limit = 50): Promise<AuditLogEntry[]> {
  const rows = await db.auditLog.findMany({
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at.toISOString(),
    actor: row.actor,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    details: row.details_json === null ? null : JSON.parse(row.details_json),
  }));
}
