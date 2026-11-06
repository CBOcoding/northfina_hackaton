// Reading and changing assets in the database. Rows are converted to the same `Asset`
// shape as data/assets.json, so the UI and domain code see one type everywhere.
import type { Asset as AssetRow, PrismaClient } from '@/generated/prisma/client';
import { assetSchema, type Asset, type AssetCategory, type AssetStatus } from '@/data/schemas';
import { withAudit } from './audit';

/** Database row → data-pack shape. Validates, so a bad value edited in by hand is caught. */
export function toAsset(row: AssetRow): Asset {
  return assetSchema.parse({
    id: row.id,
    category: row.category,
    make: row.make,
    model: row.model,
    model_year: row.model_year,
    serial_number: row.serial_number,
    condition: row.condition,
    usage: { unit: row.usage_unit, value: row.usage_value },
    previous_lives: row.previous_lives,
    status: row.status,
  });
}

/** Data-pack shape → columns for a new database row. */
export function toAssetRowData(asset: Asset) {
  return {
    id: asset.id,
    category: asset.category,
    make: asset.make,
    model: asset.model,
    model_year: asset.model_year,
    serial_number: asset.serial_number,
    condition: asset.condition,
    usage_unit: asset.usage.unit,
    usage_value: asset.usage.value,
    previous_lives: asset.previous_lives,
    status: asset.status,
  };
}

export async function listAssets(
  db: PrismaClient,
  filter: { category?: AssetCategory } = {}
): Promise<Asset[]> {
  const rows = await db.asset.findMany({
    where: filter.category ? { category: filter.category } : {},
    orderBy: { id: 'asc' },
  });
  return rows.map(toAsset);
}

export type ChangeAssetStatusResult =
  { ok: true; asset: Asset } | { ok: false; reason: 'not_found' | 'under_contract' };

/** Thrown inside the transaction to roll it back with a refusal instead of a change. */
class Refused extends Error {
  constructor(readonly reason: 'not_found' | 'under_contract') {
    super(reason);
  }
}

/**
 * Sets an asset's status and writes `asset.status_changed` to the audit log, atomically.
 * Refuses an item in an active contract: freeing it here would let it be leased twice.
 */
export async function changeAssetStatus(
  db: PrismaClient,
  input: { id: string; status: AssetStatus; actor: string }
): Promise<ChangeAssetStatusResult> {
  // withAudit stores `details` after `work` runs, so `from` is filled from the read in the
  // transaction, not from a read that another request may have made stale.
  const details = { from: '', to: input.status };
  try {
    const updated = await withAudit(
      db,
      {
        actor: input.actor,
        action: 'asset.status_changed',
        entityType: 'asset',
        entityId: input.id,
        details,
      },
      async (tx) => {
        const existing = await tx.asset.findUnique({
          where: { id: input.id },
          include: { contract_items: { where: { contract: { status: 'active' } }, take: 1 } },
        });
        if (!existing) throw new Refused('not_found');
        if (existing.contract_items.length > 0) throw new Refused('under_contract');
        details.from = existing.status;
        return tx.asset.update({ where: { id: input.id }, data: { status: input.status } });
      }
    );
    return { ok: true, asset: toAsset(updated) };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
}

/** Inserts assets that are not in the database yet. Never overwrites changes you made. */
export async function seedAssets(
  db: PrismaClient,
  assets: readonly Asset[]
): Promise<{ created: number; skipped: number }> {
  const existing = await db.asset.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((row) => row.id));
  const missing = assets.filter((asset) => !existingIds.has(asset.id));
  if (missing.length > 0) {
    await db.asset.createMany({ data: missing.map(toAssetRowData) });
  }
  return { created: missing.length, skipped: assets.length - missing.length };
}
