// Ends a contract at the end of its term (rules in src/domain/end-of-term.ts) and stores the
// result atomically with its audit row: contract status, buyout invoice, and the items'
// new state. Every ended lease counts as one more life of its items.
import type { AssetCondition, VatRates } from '@/data/schemas';
import { endOfTerm, type EndChoice, type EndOfTermResult } from '@/domain/end-of-term';
import type { ContractStatus } from '@/domain/types';
import type { PrismaClient } from '@/generated/prisma/client';
import { withAudit } from './audit';

export type EndContractInput = {
  number: string;
  choice: EndChoice;
  actor: string;
  /** Condition report per asset id, for return and pass on. */
  reports?: Record<string, { condition: AssetCondition; usageValue: number }>;
};

export type EndContractResult =
  | Extract<EndOfTermResult, { ok: true }>
  | Extract<EndOfTermResult, { ok: false }>
  | { ok: false; reason: 'not_found' };

export async function endContract(
  db: PrismaClient,
  vatRates: VatRates,
  input: EndContractInput
): Promise<EndContractResult> {
  const row = await db.contract.findUnique({
    where: { number: input.number },
    include: { items: { include: { asset: true }, orderBy: { asset_id: 'asc' } } },
  });
  if (!row) return { ok: false, reason: 'not_found' };

  const result = endOfTerm(
    vatRates,
    {
      number: row.number,
      status: row.status as ContractStatus,
      startDate: row.start_date,
      termMonths: row.term_months,
      buyoutNetCents: row.buyout_net_cents,
    },
    input.choice,
    row.items.map((i) => ({
      assetId: i.asset_id,
      usageValue: i.asset.usage_value,
      report: input.reports?.[i.asset_id],
    }))
  );
  if (!result.ok) return result;

  await withAudit(
    db,
    {
      actor: input.actor,
      action: `contract.${result.status}`,
      entityType: 'contract',
      entityId: row.number,
      details: {
        endedOn: result.endedOn,
        buyoutGrossCents: result.invoice?.grossCents ?? null,
        items: result.items,
      },
    },
    async (tx) => {
      await tx.contract.update({
        where: { id: row.id },
        data: { status: result.status, ended_on: result.endedOn },
      });
      const invoice = result.invoice;
      if (invoice) {
        await tx.invoice.create({
          data: {
            contract_id: row.id,
            seq: invoice.seq,
            number: invoice.number,
            kind: invoice.kind,
            period_start: invoice.periodStart,
            period_end: invoice.periodEnd,
            due_date: invoice.dueDate,
            net_cents: invoice.netCents,
            vat_rate_bp: invoice.vatRateBp,
            vat_cents: invoice.vatCents,
            gross_cents: invoice.grossCents,
            status: invoice.status,
          },
        });
      }
      for (const item of result.items) {
        // A bought item keeps its status: it stays with the customer, off the market.
        await tx.asset.update({
          where: { id: item.assetId },
          data: {
            previous_lives: { increment: 1 },
            ...(item.returned && {
              status: 'returned',
              condition: item.returned.condition,
              usage_value: item.returned.usageValue,
            }),
          },
        });
      }
    }
  );
  return result;
}
