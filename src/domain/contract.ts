// Signing: turn a quote into a locked contract.
//
// Which price is locked (card 2: quoted on Thursday on price list v1, signed on Friday
// when v2 is live)? Our rule, decided on purpose and shown to the customer:
//
//   1. A quote is honoured for QUOTE_VALID_DAYS days. Within that time the customer gets
//      the LOWER of the quoted price and the price on the signing day: a price rise never
//      hurts them, a price drop always reaches them.
//   2. After that, the quote has expired and the signing-day price applies.
//
// The result is a snapshot: every number that sets the rent is copied in, so later price
// lists cannot change it. Only VAT can still move, per invoice (see invoicing.ts).
import type { CoefficientTable } from '@/data/schemas';
import { daysBetween } from './calendar';
import { quoteLease, type Quote, type QuoteRefusal } from './pricing';
import type { ContractItem, ContractSnapshot, IsoDate } from './types';

export const QUOTE_VALID_DAYS = 14;

/** Why this price was locked. The UI turns the code into a sentence in the customer's language. */
export type LockReason =
  | 'same_day' // signed on the quote day: the one price there is
  | 'quote_price_honoured' // the price went up (or stayed) since the quote: quote kept
  | 'price_dropped_since_quote' // the price went down since the quote: customer gets the lower one
  | 'quote_expired'; // signed after the quote's validity: today's price

export type SigningItem = {
  assetId: string;
  lifeNumber: number;
  /** Units of this asset (a fleet); defaults to 1. Prices below are per unit. */
  quantity?: number;
  quotedPriceCents: number;
  quotedPriceListVersion: number;
  signingPriceCents: number;
  signingPriceListVersion: number;
};

export type SigningInput = {
  number: string;
  customerId: string;
  signedBy: string;
  quotedOn: IsoDate;
  signedOn: IsoDate;
  /** First invoice due date; defaults to the signing day. */
  startDate?: IsoDate;
  downPaymentCents: number;
  termMonths: number;
  items: readonly SigningItem[];
};

export type LockedPrice = {
  reason: LockReason;
  priceListVersion: number;
  quotedTotalCents: number;
  signingTotalCents: number;
  lockedTotalCents: number;
  /** How much the customer saved (or would have paid more) compared with the other price. */
  differenceCents: number;
};

export type SigningResult =
  | { ok: true; contract: ContractSnapshot; quote: Quote; lock: LockedPrice }
  | { ok: false; reason: QuoteRefusal | 'no_items' | 'signed_before_quote' | 'invalid_quantity' };

const unitsOf = (item: SigningItem) => item.quantity ?? 1;

/** Decides which list price is locked, and why. Pure: no clock, the caller passes the days. */
export function decideLockedPrice(
  quotedOn: IsoDate,
  signedOn: IsoDate,
  items: readonly SigningItem[]
): LockedPrice {
  const quotedTotalCents = items.reduce((sum, i) => sum + i.quotedPriceCents * unitsOf(i), 0);
  const signingTotalCents = items.reduce((sum, i) => sum + i.signingPriceCents * unitsOf(i), 0);
  const days = daysBetween(quotedOn, signedOn);
  const first = items[0];
  const quotedVersion = first ? first.quotedPriceListVersion : 0;
  const signingVersion = first ? first.signingPriceListVersion : 0;

  const lockSigning = (reason: LockReason): LockedPrice => ({
    reason,
    priceListVersion: signingVersion,
    quotedTotalCents,
    signingTotalCents,
    lockedTotalCents: signingTotalCents,
    differenceCents: Math.abs(quotedTotalCents - signingTotalCents),
  });
  const lockQuote = (reason: LockReason): LockedPrice => ({
    ...lockSigning(reason),
    priceListVersion: quotedVersion,
    lockedTotalCents: quotedTotalCents,
  });

  if (days === 0) return lockQuote('same_day');
  if (days > QUOTE_VALID_DAYS) return lockSigning('quote_expired');
  return signingTotalCents < quotedTotalCents
    ? lockSigning('price_dropped_since_quote')
    : lockQuote('quote_price_honoured');
}

/** Signs: locks the price, prices the lease and returns the frozen contract snapshot. */
export function signContract(table: CoefficientTable, input: SigningInput): SigningResult {
  if (input.items.length === 0) return { ok: false, reason: 'no_items' };
  if (input.items.some((i) => !Number.isInteger(unitsOf(i)) || unitsOf(i) < 1)) {
    return { ok: false, reason: 'invalid_quantity' };
  }
  if (daysBetween(input.quotedOn, input.signedOn) < 0) {
    return { ok: false, reason: 'signed_before_quote' };
  }

  const lock = decideLockedPrice(input.quotedOn, input.signedOn, input.items);
  const priced = quoteLease(table, {
    listPriceCents: lock.lockedTotalCents,
    downPaymentCents: input.downPaymentCents,
    termMonths: input.termMonths,
  });
  if (!priced.ok) return { ok: false, reason: priced.reason };
  const { quote } = priced;

  const usesQuote = lock.reason === 'same_day' || lock.reason === 'quote_price_honoured';
  const items: ContractItem[] = input.items.map((i) =>
    Object.freeze({
      assetId: i.assetId,
      lifeNumber: i.lifeNumber,
      quantity: unitsOf(i),
      listPriceCents: usesQuote ? i.quotedPriceCents : i.signingPriceCents,
    })
  );

  const contract: ContractSnapshot = Object.freeze({
    number: input.number,
    customerId: input.customerId,
    signedOn: input.signedOn,
    startDate: input.startDate ?? input.signedOn,
    priceListVersion: lock.priceListVersion,
    items: Object.freeze(items),
    listPriceCents: quote.listPriceCents,
    downPaymentCents: quote.downPaymentCents,
    financedCents: quote.financedCents,
    band: quote.band,
    factorMicro: quote.factorMicro,
    termMonths: quote.termMonths,
    monthlyNetCents: quote.monthlyNetCents,
    buyoutPercent: quote.buyoutPercent,
    buyoutNetCents: quote.buyoutNetCents,
    lockReason: lock.reason,
    signedBy: input.signedBy,
    status: 'active',
    endedOn: null,
  });
  return { ok: true, contract, quote, lock };
}
