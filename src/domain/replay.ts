// Time travel (our wildcard): replay a contract month by month. Given the invoices and a
// month, what has been invoiced, what is left, and did VAT change compared with the start?
// Pure: the page passes in the invoices it read; nothing here reads the clock.
import type { Cents, InvoiceLine, IsoDate } from './types';

export type VatChange = {
  fromRateBp: number;
  toRateBp: number;
  /** Due date of the first invoice at the new rate. */
  since: IsoDate;
  /** How much more (or less) this invoice costs than the first one, with VAT. */
  grossDifferenceCents: Cents;
  /** The locked rent without VAT, unchanged. */
  netCents: Cents;
};

export type ReplayState = {
  month: number;
  current: InvoiceLine;
  invoicedGrossCents: Cents;
  remainingGrossCents: Cents;
  remainingCount: number;
  /** Set when the current invoice uses a different VAT rate than the first one. */
  vatChange: VatChange | null;
};

/** The replay at `month` (1 = first invoice). Out-of-range months are clamped. */
export function replayAt(invoices: readonly InvoiceLine[], month: number): ReplayState {
  const first = invoices[0];
  if (!first) throw new RangeError('a contract has at least one invoice');
  const m = Math.min(Math.max(Math.trunc(month), 1), invoices.length);
  const current = invoices[m - 1] ?? first;
  const sum = (list: readonly InvoiceLine[]) => list.reduce((s, i) => s + i.grossCents, 0);

  let vatChange: VatChange | null = null;
  if (current.vatRateBp !== first.vatRateBp) {
    const firstAtNewRate = invoices.find((i) => i.vatRateBp === current.vatRateBp) ?? current;
    vatChange = {
      fromRateBp: first.vatRateBp,
      toRateBp: current.vatRateBp,
      since: firstAtNewRate.dueDate,
      grossDifferenceCents: current.grossCents - first.grossCents,
      netCents: current.netCents,
    };
  }

  return {
    month: m,
    current,
    invoicedGrossCents: sum(invoices.slice(0, m)),
    remainingGrossCents: sum(invoices.slice(m)),
    remainingCount: invoices.length - m,
    vatChange,
  };
}

/** The month whose invoice is the latest one due on or before `isoDate` (at least 1). */
export function monthOn(invoices: readonly InvoiceLine[], isoDate: IsoDate): number {
  const due = invoices.filter((i) => i.dueDate <= isoDate).length;
  return Math.min(Math.max(due, 1), Math.max(invoices.length, 1));
}
