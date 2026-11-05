// Monthly rent invoices for a locked contract.
//
//   invoice k (1..term) is due on addMonthsClamped(start, k − 1), paid in advance,
//   and covers the period from its due date to the day before the next one.
//   net  = the locked monthly rent (never changes)
//   VAT  = net × rate valid on the due date, rounded once per invoice, half up
//   gross = net + VAT
//
// So Σ net = monthly rent × term exactly, and Σ gross = Σ net + Σ VAT exactly: the totals
// are sums of the invoices, never a separately rounded figure that could disagree.
import type { VatRates } from '@/data/schemas';
import { addMonthsClamped, dayBefore } from './calendar';
import { applyBasisPoints } from './money';
import type { Cents, InvoiceLine, IsoDate } from './types';
import { vatRateOn } from './vat';

export type RentScheduleInput = {
  contractNumber: string;
  startDate: IsoDate;
  termMonths: number;
  monthlyNetCents: Cents;
};

export type InvoiceTotals = { netCents: Cents; vatCents: Cents; grossCents: Cents };

export type RentScheduleResult =
  | { ok: true; invoices: InvoiceLine[]; totals: InvoiceTotals }
  | { ok: false; reason: 'no_vat_rate'; dueDate: IsoDate };

/** Invoice number: contract number + 3-digit sequence, e.g. ML-2026-0001-007. */
export function invoiceNumber(contractNumber: string, seq: number): string {
  return `${contractNumber}-${String(seq).padStart(3, '0')}`;
}

/** One invoice line for an amount due on a date, with VAT at that date's rate. */
export function invoiceLine(
  vatRates: VatRates,
  line: Pick<
    InvoiceLine,
    'seq' | 'number' | 'kind' | 'periodStart' | 'periodEnd' | 'dueDate' | 'netCents'
  >
): InvoiceLine | null {
  const rate = vatRateOn(vatRates, line.dueDate);
  if (!rate.ok) return null;
  const vatCents = applyBasisPoints(line.netCents, rate.rateBp);
  return {
    ...line,
    vatRateBp: rate.rateBp,
    vatCents,
    grossCents: line.netCents + vatCents,
    status: 'issued',
  };
}

/** All rent invoices of a contract, in order, with their totals. */
export function rentSchedule(vatRates: VatRates, input: RentScheduleInput): RentScheduleResult {
  const { contractNumber, startDate, termMonths, monthlyNetCents } = input;
  if (!Number.isInteger(termMonths) || termMonths < 1) {
    throw new RangeError(`termMonths must be a whole number ≥ 1, got ${termMonths}`);
  }
  if (!Number.isSafeInteger(monthlyNetCents) || monthlyNetCents < 0) {
    throw new RangeError(`monthlyNetCents must be whole cents ≥ 0, got ${monthlyNetCents}`);
  }

  const invoices: InvoiceLine[] = [];
  for (let k = 0; k < termMonths; k++) {
    const dueDate = addMonthsClamped(startDate, k);
    const line = invoiceLine(vatRates, {
      seq: k + 1,
      number: invoiceNumber(contractNumber, k + 1),
      kind: 'rent',
      periodStart: dueDate,
      periodEnd: dayBefore(addMonthsClamped(startDate, k + 1)),
      dueDate,
      netCents: monthlyNetCents,
    });
    if (!line) return { ok: false, reason: 'no_vat_rate', dueDate };
    invoices.push(line);
  }
  return { ok: true, invoices, totals: sumInvoices(invoices) };
}

export function sumInvoices(invoices: readonly InvoiceLine[]): InvoiceTotals {
  return invoices.reduce(
    (t, i) => ({
      netCents: t.netCents + i.netCents,
      vatCents: t.vatCents + i.vatCents,
      grossCents: t.grossCents + i.grossCents,
    }),
    { netCents: 0, vatCents: 0, grossCents: 0 }
  );
}
