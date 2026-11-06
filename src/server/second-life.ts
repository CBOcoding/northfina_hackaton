// Leasing a returned item again: its second (or third, ...) life. The match, the work and the
// new price come from matchSecondLife; signing reuses signLease, so the contract, its invoices,
// the asset's new condition and the audit row are stored in one transaction.
import {
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
  loadVatRates,
} from '@/data/load';
import type { SecondLifeRequest } from '@/data/schemas';
import { listPriceOn } from '@/domain/price-list';
import { matchSecondLife } from '@/domain/second-life';
import type { IsoDate } from '@/domain/types';
import type { PrismaClient } from '@/generated/prisma/client';
import { toAsset } from './assets';
import { signLease, type SignLeaseRefusal } from './contracts';

export type LeaseSecondLifeInput = {
  assetId: string;
  today: IsoDate;
  actor: string;
};

export type LeaseSecondLifeResult =
  | { ok: true; number: string; waitingListId: string; lifeNumber: number }
  | { ok: false; reason: 'asset_not_found' | 'not_returned' | 'nobody_fits' | SignLeaseRefusal };

/** Waiting-list ids that already have a contract: they were served and leave the list. */
export async function servedWaitingListIds(
  db: PrismaClient,
  demand: readonly SecondLifeRequest[]
): Promise<string[]> {
  const rows = await db.contract.findMany({
    where: { customer_id: { in: demand.map((r) => r.id) } },
    select: { customer_id: true },
  });
  return rows.map((r) => r.customer_id);
}

/** Signs the next life of a returned item with whoever the waiting list puts first. */
export async function leaseSecondLife(
  db: PrismaClient,
  input: LeaseSecondLifeInput
): Promise<LeaseSecondLifeResult> {
  const row = await db.asset.findUnique({ where: { id: input.assetId } });
  if (!row) return { ok: false, reason: 'asset_not_found' };
  const asset = toAsset(row);
  if (asset.status !== 'returned') return { ok: false, reason: 'not_returned' };

  const [priceLists, table, vatRates, costs, curves, demand] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
    loadRefurbishmentCosts(),
    loadResidualCurves(),
    loadSecondLifeDemand(),
  ]);
  const price = listPriceOn(priceLists, asset.id, input.today);
  if (!price.ok) return { ok: false, reason: 'no_price_on_date' };
  const served = await servedWaitingListIds(db, demand);

  const match = matchSecondLife({
    asset,
    listPriceCents: price.priceCents,
    today: input.today,
    waitingList: demand,
    costs,
    curves,
    table,
    served,
  });
  const winner = match.winner;
  if (!winner?.plan || !winner.quote || winner.valueAfterCents === null) {
    return { ok: false, reason: 'nobody_fits' };
  }

  const signed = await signLease(
    db,
    { priceLists, table, vatRates },
    {
      actor: input.actor,
      customerId: winner.request.id,
      signedBy: winner.request.who,
      items: [{ assetId: asset.id }],
      quotedOn: input.today,
      signedOn: input.today,
      downPaymentCents: 0,
      termMonths: winner.quote.termMonths,
      secondLife: {
        priceCents: winner.valueAfterCents,
        conditionAfter: winner.plan.conditionAfter,
        usageAfter: winner.plan.usageAfter,
      },
    }
  );
  if (!signed.ok) return signed;
  return {
    ok: true,
    number: signed.stored.contract.number,
    waitingListId: winner.request.id,
    lifeNumber: asset.previous_lives + 1,
  };
}
