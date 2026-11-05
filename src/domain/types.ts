// Shared shapes for the leasing domain. Both streams build against these, so change them
// only together. Money is integer euro cents; dates are ISO strings `YYYY-MM-DD`.

/** Integer euro cents. 389000 = 3 890,00 €. */
export type Cents = number;

/** ISO calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Lease length in months, as columns of the coefficient table. */
export type TermMonths = 12 | 24 | 36 | 48;

export type ContractStatus = 'active' | 'bought' | 'returned' | 'passed_on' | 'exited_early';

export type ApplicationDecision = 'pending' | 'approved' | 'rejected' | 'manual_review';

export type InvoiceKind = 'rent' | 'buyout' | 'early_exit';

export type InvoiceStatus = 'issued' | 'paid';

/** One item under a contract. `lifeNumber` 1 = first lease, 2 = second life, ... */
export type ContractItem = {
  assetId: string;
  /** Net list price of ONE unit. Line total = listPriceCents × quantity. */
  listPriceCents: Cents;
  /** Units of this asset, e.g. 4 for a fleet of 4 × ebike-004. At least 1. */
  quantity: number;
  lifeNumber: number;
};

/**
 * The locked contract. Everything that sets the price is copied in at signing and is never
 * recomputed from price lists: price changes later cannot touch it.
 */
export type ContractSnapshot = {
  number: string;
  customerId: string;
  signedOn: IsoDate;
  startDate: IsoDate;
  priceListVersion: number;
  items: readonly ContractItem[];
  listPriceCents: Cents;
  downPaymentCents: Cents;
  financedCents: Cents;
  band: string;
  /** Monthly factor × 1 000 000, e.g. 0.027584 → 27584. Integer, so no float maths on money. */
  factorMicro: number;
  termMonths: TermMonths;
  monthlyNetCents: Cents;
  buyoutPercent: number;
  buyoutNetCents: Cents;
  /** Why this price was locked, shown to the customer (e.g. quote price vs signing-day price). */
  lockReason: string;
  signedBy: string;
  status: ContractStatus;
  endedOn: IsoDate | null;
};

/** One invoice line. VAT uses the rate valid on `dueDate`. */
export type InvoiceLine = {
  seq: number;
  number: string;
  kind: InvoiceKind;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  dueDate: IsoDate;
  netCents: Cents;
  /** Basis points: 2550 = 25.5 %. */
  vatRateBp: number;
  vatCents: Cents;
  grossCents: Cents;
  status: InvoiceStatus;
};
