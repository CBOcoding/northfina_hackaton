// End of term: the customer buys the item, returns it, or passes it on to its next life.
//
//   - The term ends on start date + term months (the day after the last rent period).
//   - Buy: one buyout invoice, due on that day, for the buyout locked at signing; VAT at the
//     rate valid on that day, like every other invoice. The item leaves the loop.
//   - Return: the item comes back to us with a condition report (condition and usage).
//   - Pass on: the same report, but the customer asks us to give it straight to the next
//     person on the waiting list. For the data both end the same way: the item is
//     `returned` and one more life is counted; the contract status says which one it was.
// Usage can only go up: a report with less usage than we already know is refused.
import type { AssetCondition, VatRates } from '@/data/schemas';
import { addMonthsClamped } from './calendar';
import { invoiceLine, invoiceNumber } from './invoicing';
import type { Cents, ContractStatus, InvoiceLine, IsoDate } from './types';

export type EndChoice = 'buy' | 'return' | 'pass_on';

const STATUS_AFTER: Record<EndChoice, ContractStatus> = {
  buy: 'bought',
  return: 'returned',
  pass_on: 'passed_on',
};

export type EndOfTermContract = {
  number: string;
  status: ContractStatus;
  startDate: IsoDate;
  termMonths: number;
  buyoutNetCents: Cents;
};

/** What we know about an item now, and (for return / pass on) what the customer reports. */
export type EndOfTermItem = {
  assetId: string;
  usageValue: number;
  report?: { condition: AssetCondition; usageValue: number };
};

export type ItemAfter = {
  assetId: string;
  /** null when the item is bought: it stays with the customer and leaves the loop. */
  returned: { condition: AssetCondition; usageValue: number } | null;
};

export type EndOfTermResult =
  | {
      ok: true;
      status: ContractStatus;
      endedOn: IsoDate;
      /** The buyout invoice when the customer buys, otherwise null. */
      invoice: InvoiceLine | null;
      items: ItemAfter[];
    }
  | { ok: false; reason: 'not_active' | 'no_vat_rate' }
  | { ok: false; reason: 'missing_report' | 'usage_went_down'; assetId: string };

/** The day the term is over: start date + term months, clamped to the month's last day. */
export function termEndDate(startDate: IsoDate, termMonths: number): IsoDate {
  return addMonthsClamped(startDate, termMonths);
}

export function endOfTerm(
  vatRates: VatRates,
  contract: EndOfTermContract,
  choice: EndChoice,
  items: readonly EndOfTermItem[]
): EndOfTermResult {
  if (contract.status !== 'active') return { ok: false, reason: 'not_active' };
  const endedOn = termEndDate(contract.startDate, contract.termMonths);
  const status = STATUS_AFTER[choice];

  if (choice === 'buy') {
    const seq = contract.termMonths + 1;
    const invoice = invoiceLine(vatRates, {
      seq,
      number: invoiceNumber(contract.number, seq),
      kind: 'buyout',
      periodStart: null,
      periodEnd: null,
      dueDate: endedOn,
      netCents: contract.buyoutNetCents,
    });
    if (!invoice) return { ok: false, reason: 'no_vat_rate' };
    return {
      ok: true,
      status,
      endedOn,
      invoice,
      items: items.map((i) => ({ assetId: i.assetId, returned: null })),
    };
  }

  const after: ItemAfter[] = [];
  for (const item of items) {
    if (!item.report) return { ok: false, reason: 'missing_report', assetId: item.assetId };
    if (item.report.usageValue < item.usageValue) {
      return { ok: false, reason: 'usage_went_down', assetId: item.assetId };
    }
    after.push({ assetId: item.assetId, returned: { ...item.report } });
  }
  return { ok: true, status, endedOn, invoice: null, items: after };
}
