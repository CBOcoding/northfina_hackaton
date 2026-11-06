// Signing a lease and reading it back. One transaction writes the contract, its items, all
// of its rent invoices and the audit row: either everything is stored or nothing is.
// The numbers come from the pure domain functions (signContract, rentSchedule); this file
// only loads, checks and stores.
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import type { AssetCondition, CoefficientTable, PriceList, VatRates } from '@/data/schemas';
import { signContract, type LockedPrice, type SigningItem } from '@/domain/contract';
import { rentSchedule } from '@/domain/invoicing';
import { listPriceOn } from '@/domain/price-list';
import { isSignable, parseReasons } from '@/domain/signing';
import type {
  ContractSnapshot,
  ContractStatus,
  InvoiceKind,
  InvoiceLine,
  InvoiceStatus,
  IsoDate,
  TermMonths,
} from '@/domain/types';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { withAudit } from './audit';

export { isSignable } from '@/domain/signing';

export type LeaseData = {
  priceLists: readonly PriceList[];
  table: CoefficientTable;
  vatRates: VatRates;
};

export type SignLeaseInput = {
  actor: string;
  customerId: string;
  signedBy: string;
  /** What is leased: each asset once, with how many units (a fleet). Quantity defaults to 1. */
  items: readonly { assetId: string; quantity?: number }[];
  quotedOn: IsoDate;
  signedOn: IsoDate;
  startDate?: IsoDate;
  downPaymentCents: number;
  termMonths: number;
  /** An approved application from the question flow. Without it, one is recorded as approved. */
  applicationId?: string;
  answers?: Record<string, unknown>;
  /**
   * A returned item leased again (second or later life). Its price is its market value after
   * refurbishment, not the price list, and signing records the condition after the work.
   */
  secondLife?: SecondLifeTerms;
};

export type SecondLifeTerms = {
  priceCents: number;
  conditionAfter: AssetCondition;
  usageAfter: number;
};

export type StoredContract = {
  contract: ContractSnapshot;
  invoices: InvoiceLine[];
};

export type SignLeaseRefusal =
  | 'asset_not_found'
  | 'asset_not_available'
  | 'no_price_on_date'
  | 'application_not_found'
  | 'application_not_approved'
  | 'application_already_signed'
  | 'no_vat_rate'
  | 'no_items'
  | 'duplicate_item'
  | 'invalid_quantity'
  | 'signed_before_quote'
  | 'down_payment_negative'
  | 'down_payment_not_below_price'
  | 'below_minimum'
  | 'above_maximum'
  | 'unknown_term';

export type SignLeaseResult =
  { ok: true; stored: StoredContract; lock: LockedPrice } | { ok: false; reason: SignLeaseRefusal };

/** ML-2026-0001, ML-2026-0002, ... numbered per signing year. */
export async function nextContractNumber(db: PrismaClient, signedOn: IsoDate): Promise<string> {
  const year = signedOn.slice(0, 4);
  const count = await db.contract.count({ where: { number: { startsWith: `ML-${year}-` } } });
  return `ML-${year}-${String(count + 1).padStart(4, '0')}`;
}

export type PreparedLease =
  | { ok: true; contract: ContractSnapshot; lock: LockedPrice; invoices: InvoiceLine[] }
  | { ok: false; reason: SignLeaseRefusal };

/**
 * Everything signing does except writing: checks, locked price, contract and invoices.
 * The signing page shows this as a preview, so what the customer sees is what gets stored.
 */
export async function prepareLease(
  db: PrismaClient,
  data: LeaseData,
  input: Omit<SignLeaseInput, 'actor' | 'answers'>
): Promise<PreparedLease> {
  if (input.items.length === 0) return { ok: false, reason: 'no_items' };
  const assetIds = input.items.map((i) => i.assetId);
  if (new Set(assetIds).size !== assetIds.length) return { ok: false, reason: 'duplicate_item' };

  // Checked before the items, so a second sign of one application says so, not 'not available'.
  if (input.applicationId) {
    const application = await db.application.findUnique({
      where: { id: input.applicationId },
      include: { contract: true },
    });
    if (!application) return { ok: false, reason: 'application_not_found' };
    if (
      !isSignable({
        decision: application.decision,
        reasons: parseReasons(application.reasons_json),
      })
    )
      return { ok: false, reason: 'application_not_approved' };
    if (application.contract) return { ok: false, reason: 'application_already_signed' };
  }

  const assets = await db.asset.findMany({ where: { id: { in: assetIds } } });
  if (assets.length !== assetIds.length) return { ok: false, reason: 'asset_not_found' };
  // A new lease needs an available item; a second life needs one that is back with us.
  const leasable = input.secondLife ? 'returned' : 'available';
  if (input.secondLife && input.items.length !== 1) return { ok: false, reason: 'duplicate_item' };
  if (assets.some((a) => a.status !== leasable))
    return { ok: false, reason: 'asset_not_available' };

  const items: SigningItem[] = [];
  for (const { assetId: id, quantity } of input.items) {
    const asset = assets.find((a) => a.id === id);
    const quoted = listPriceOn(data.priceLists, id, input.quotedOn);
    const signing = listPriceOn(data.priceLists, id, input.signedOn);
    if (!asset || !quoted.ok || !signing.ok) return { ok: false, reason: 'no_price_on_date' };
    // Second life: the refurbished item's market value is the price, on both dates.
    const second = input.secondLife?.priceCents;
    items.push({
      assetId: id,
      lifeNumber: asset.previous_lives + 1,
      quantity: quantity ?? 1,
      quotedPriceCents: second ?? quoted.priceCents,
      quotedPriceListVersion: quoted.priceListVersion,
      signingPriceCents: second ?? signing.priceCents,
      signingPriceListVersion: signing.priceListVersion,
    });
  }

  const number = await nextContractNumber(db, input.signedOn);
  const signed = signContract(data.table, {
    number,
    customerId: input.customerId,
    signedBy: input.signedBy,
    quotedOn: input.quotedOn,
    signedOn: input.signedOn,
    startDate: input.startDate,
    downPaymentCents: input.downPaymentCents,
    termMonths: input.termMonths,
    items,
  });
  if (!signed.ok) return { ok: false, reason: signed.reason };
  const { contract, lock } = signed;

  const schedule = rentSchedule(data.vatRates, {
    contractNumber: contract.number,
    startDate: contract.startDate,
    termMonths: contract.termMonths,
    monthlyNetCents: contract.monthlyNetCents,
  });
  if (!schedule.ok) return { ok: false, reason: 'no_vat_rate' };
  return { ok: true, contract, lock, invoices: schedule.invoices };
}

/** Thrown inside the transaction when another request took one of the items first. */
class AssetTaken extends Error {}

/** Contract numbers are counted before the transaction, so two signs at once can pick the same one. */
const SIGN_ATTEMPTS = 3;

/** Signs a lease: prepares it, then stores contract, items, invoices and audit row atomically. */
export async function signLease(
  db: PrismaClient,
  data: LeaseData,
  input: SignLeaseInput
): Promise<SignLeaseResult> {
  for (let attempt = 1; ; attempt++) {
    const prepared = await prepareLease(db, data, input);
    if (!prepared.ok) return prepared;
    try {
      await storeLease(db, input, prepared);
      return {
        ok: true,
        stored: { contract: prepared.contract, invoices: prepared.invoices },
        lock: prepared.lock,
      };
    } catch (error) {
      if (error instanceof AssetTaken) return { ok: false, reason: 'asset_not_available' };
      const field = uniqueViolation(error);
      if (field === 'application_id') return { ok: false, reason: 'application_already_signed' };
      // Invoice numbers derive from the contract number, so prepare everything again.
      if (field === 'number' && attempt < SIGN_ATTEMPTS) continue;
      throw error;
    }
  }
}

/** Which unique field a Prisma P2002 error is about, or null for any other error. */
function uniqueViolation(error: unknown): 'application_id' | 'number' | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return null;
  // The SQLite adapter puts the fields in meta.driverAdapterError, not meta.target.
  const text = `${JSON.stringify(error.meta ?? {})} ${error.message}`;
  if (text.includes('application_id')) return 'application_id';
  return text.includes('number') ? 'number' : null;
}

async function storeLease(
  db: PrismaClient,
  input: SignLeaseInput,
  prepared: Extract<PreparedLease, { ok: true }>
): Promise<void> {
  const { contract, lock } = prepared;
  const schedule = { invoices: prepared.invoices };
  const assetIds = input.items.map((i) => i.assetId);

  await withAudit(
    db,
    {
      actor: input.actor,
      action: 'contract.signed',
      entityType: 'contract',
      entityId: contract.number,
      details: {
        customerId: contract.customerId,
        items: contract.items.map((i) => ({ assetId: i.assetId, quantity: i.quantity })),
        monthlyNetCents: contract.monthlyNetCents,
        lockReason: contract.lockReason,
        priceListVersion: contract.priceListVersion,
        invoices: schedule.invoices.length,
        ...(input.secondLife ? { secondLife: input.secondLife } : {}),
      },
    },
    async (tx) => {
      const applicationId =
        input.applicationId ??
        (
          await tx.application.create({
            data: {
              customer_id: input.customerId,
              quoted_on: input.quotedOn,
              price_list_version: lock.priceListVersion,
              list_price_cents: contract.listPriceCents,
              down_payment_cents: contract.downPaymentCents,
              term_months: contract.termMonths,
              answers_json: JSON.stringify(input.answers ?? {}),
              decision: 'approved',
              items: {
                create: contract.items.map((i) => ({
                  asset_id: i.assetId,
                  list_price_cents: i.listPriceCents,
                  quantity: i.quantity,
                })),
              },
            },
          })
        ).id;

      await tx.contract.create({ data: toContractRow(contract, applicationId, schedule.invoices) });
      // The status was checked before this transaction. Claim the items only if they still
      // have it, so two signs at once cannot both lease one physical item.
      const claimed = await tx.asset.updateMany({
        where: { id: { in: assetIds }, status: input.secondLife ? 'returned' : 'available' },
        data: input.secondLife
          ? {
              status: 'reserved',
              condition: input.secondLife.conditionAfter,
              usage_value: input.secondLife.usageAfter,
            }
          : { status: 'reserved' },
      });
      if (claimed.count !== assetIds.length) throw new AssetTaken();
    }
  );
}

function toContractRow(
  c: ContractSnapshot,
  applicationId: string,
  invoices: readonly InvoiceLine[]
): Prisma.ContractUncheckedCreateInput {
  return {
    number: c.number,
    // A scalar key, not connect: a second contract for one application then hits the unique
    // index (P2002) instead of Prisma's relation check.
    application_id: applicationId,
    customer_id: c.customerId,
    signed_on: c.signedOn,
    start_date: c.startDate,
    price_list_version: c.priceListVersion,
    list_price_cents: c.listPriceCents,
    down_payment_cents: c.downPaymentCents,
    financed_cents: c.financedCents,
    band: c.band,
    factor_micro: c.factorMicro,
    term_months: c.termMonths,
    monthly_net_cents: c.monthlyNetCents,
    buyout_percent: c.buyoutPercent,
    buyout_net_cents: c.buyoutNetCents,
    lock_reason: c.lockReason,
    signed_by: c.signedBy,
    status: c.status,
    items: {
      create: c.items.map((i) => ({
        asset_id: i.assetId,
        list_price_cents: i.listPriceCents,
        quantity: i.quantity,
        life_number: i.lifeNumber,
      })),
    },
    invoices: {
      create: invoices.map((i) => ({
        seq: i.seq,
        number: i.number,
        kind: i.kind,
        period_start: i.periodStart,
        period_end: i.periodEnd,
        due_date: i.dueDate,
        net_cents: i.netCents,
        vat_rate_bp: i.vatRateBp,
        vat_cents: i.vatCents,
        gross_cents: i.grossCents,
        status: i.status,
      })),
    },
  };
}

/** A stored contract with its invoices in order, or null. */
export async function getContract(
  db: PrismaClient,
  number: string
): Promise<StoredContract | null> {
  const row = await db.contract.findUnique({
    where: { number },
    include: { items: { orderBy: { asset_id: 'asc' } }, invoices: { orderBy: { seq: 'asc' } } },
  });
  if (!row) return null;
  return {
    contract: {
      number: row.number,
      customerId: row.customer_id,
      signedOn: row.signed_on,
      startDate: row.start_date,
      priceListVersion: row.price_list_version,
      items: row.items.map((i) => ({
        assetId: i.asset_id,
        listPriceCents: i.list_price_cents,
        quantity: i.quantity,
        lifeNumber: i.life_number,
      })),
      listPriceCents: row.list_price_cents,
      downPaymentCents: row.down_payment_cents,
      financedCents: row.financed_cents,
      band: row.band,
      factorMicro: row.factor_micro,
      termMonths: row.term_months as TermMonths,
      monthlyNetCents: row.monthly_net_cents,
      buyoutPercent: row.buyout_percent,
      buyoutNetCents: row.buyout_net_cents,
      lockReason: row.lock_reason,
      signedBy: row.signed_by,
      status: row.status as ContractStatus,
      endedOn: row.ended_on,
    },
    invoices: row.invoices.map((i) => ({
      seq: i.seq,
      number: i.number,
      kind: i.kind as InvoiceKind,
      periodStart: i.period_start,
      periodEnd: i.period_end,
      dueDate: i.due_date,
      netCents: i.net_cents,
      vatRateBp: i.vat_rate_bp,
      vatCents: i.vat_cents,
      grossCents: i.gross_cents,
      status: i.status as InvoiceStatus,
    })),
  };
}

export type ContractSummary = {
  number: string;
  customerId: string;
  signedOn: IsoDate;
  termMonths: number;
  monthlyNetCents: number;
  status: string;
  items: { assetId: string; quantity: number }[];
};

/** All contracts, newest first, for an overview page. */
export async function listContracts(db: PrismaClient): Promise<ContractSummary[]> {
  const rows = await db.contract.findMany({
    orderBy: [{ signed_on: 'desc' }, { number: 'desc' }],
    include: { items: true },
  });
  return rows.map((r) => ({
    number: r.number,
    customerId: r.customer_id,
    signedOn: r.signed_on,
    termMonths: r.term_months,
    monthlyNetCents: r.monthly_net_cents,
    status: r.status,
    items: r.items.map((i) => ({ assetId: i.asset_id, quantity: i.quantity })),
  }));
}

/** The read-only data pack files that signing needs. */
export async function loadLeaseData(): Promise<LeaseData> {
  const [priceLists, table, vatRates] = await Promise.all([
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  return { priceLists, table, vatRates };
}

export type SignableApplication = {
  id: string;
  customerId: string;
  quotedOn: IsoDate;
  termMonths: number;
  downPaymentCents: number;
  decision: string;
  /** Eligibility reason codes, e.g. SIGNATORY_REQUIRED. */
  reasons: string[];
  answers: Record<string, unknown>;
  items: { assetId: string; quantity: number }[];
  /** Set when this application was already signed. */
  contractNumber: string | null;
};

/** An application as the signing step needs it, or null. */
export async function getSignableApplication(
  db: PrismaClient,
  id: string
): Promise<SignableApplication | null> {
  const row = await db.application.findUnique({
    where: { id },
    include: { items: { orderBy: { asset_id: 'asc' } }, contract: { select: { number: true } } },
  });
  if (!row) return null;
  const answers = parseAnswers(row.answers_json);
  return {
    id: row.id,
    customerId: row.customer_id,
    quotedOn: row.quoted_on,
    termMonths: row.term_months,
    downPaymentCents: row.down_payment_cents,
    decision: row.decision,
    reasons: parseReasons(row.reasons_json),
    answers,
    items: row.items.map((i) => ({ assetId: i.asset_id, quantity: i.quantity })),
    contractNumber: row.contract?.number ?? null,
  };
}

/** The lease an application asks for, signed on `signedOn`. Items and terms come from the application only. */
export function leaseFromApplication(
  application: SignableApplication,
  signedBy: string,
  signedOn: IsoDate
): Omit<SignLeaseInput, 'actor'> {
  return {
    customerId: application.customerId,
    signedBy,
    items: application.items,
    quotedOn: application.quotedOn,
    signedOn,
    downPaymentCents: application.downPaymentCents,
    termMonths: application.termMonths,
    applicationId: application.id,
  };
}

/** Signs an approved application. The browser sends only who signs; the rest is read here. */
export async function signApplication(
  db: PrismaClient,
  data: LeaseData,
  input: { applicationId: string; signedBy: string; signedOn: IsoDate; actor: string }
): Promise<SignLeaseResult> {
  const application = await getSignableApplication(db, input.applicationId);
  if (!application) return { ok: false, reason: 'application_not_found' };
  return signLease(db, data, {
    ...leaseFromApplication(application, input.signedBy, input.signedOn),
    actor: input.actor,
  });
}

/** Stored answers as an object; broken JSON counts as no answers. */
function parseAnswers(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
