// Submitting a lease application. The client sends ids and answers only; prices, VAT, the
// customer record and today's date come from the server, so nothing here trusts the client.
import { randomUUID } from 'node:crypto';
import {
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadQuestions,
  loadVatRates,
} from '@/data/load';
import type { PrismaClient } from '@/generated/prisma/client';
import {
  customerFromAnswers,
  dealFor,
  missingQuestionIds,
  withRecordAnswers,
} from '@/domain/application';
import { evaluateEligibility, type Reason } from '@/domain/eligibility';
import { maxDownPaymentCents } from '@/domain/down-payment';
import { withVat } from '@/domain/explain';
import { listPriceOn } from '@/domain/price-list';
import { quoteLease, type Quote } from '@/domain/pricing';
import { pruneAnswers, type Answers } from '@/domain/question-flow';
import type { ApplicationDecision, Cents, IsoDate, TermMonths } from '@/domain/types';
import { vatRateOn } from '@/domain/vat';
import { withAudit } from './audit';

export type ApplicationInput = {
  customerId: string;
  items: readonly { assetId: string; quantity: number }[];
  termMonths: TermMonths;
  downPaymentCents: Cents;
  answers: Answers;
};

export type ApplicationOutcome = {
  applicationId: string;
  decision: ApplicationDecision;
  reasons: Reason[];
  quote: Quote | null;
  monthlyGrossCents: Cents | null;
  droppedAnswers: string[];
};

export type CreateApplicationResult =
  | { ok: true; outcome: ApplicationOutcome }
  | { ok: false; reason: 'unknown_customer' | 'mixed_categories' }
  | {
      ok: false;
      reason: 'asset_not_found' | 'asset_not_available' | 'price_not_available';
      id: string;
    }
  | { ok: false; reason: 'missing_answers'; ids: string[] }
  | { ok: false; reason: 'down_payment_too_high'; maxCents: Cents };

/** Prices, checks and saves one application (with an `application.submitted` audit row, atomically). */
export async function createApplication(
  db: PrismaClient,
  input: ApplicationInput,
  today: IsoDate
): Promise<CreateApplicationResult> {
  const [customers, questionsFile, priceLists, table, vatRates] = await Promise.all([
    loadCustomers(),
    loadQuestions(),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const base = customers.find((c) => c.id === input.customerId);
  if (!base) return { ok: false, reason: 'unknown_customer' };

  const rows = await db.asset.findMany({
    where: { id: { in: input.items.map((i) => i.assetId) } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const item of input.items) {
    if (!byId.has(item.assetId)) return { ok: false, reason: 'asset_not_found', id: item.assetId };
  }
  for (const item of input.items) {
    if (byId.get(item.assetId)!.status !== 'available') {
      return { ok: false, reason: 'asset_not_available', id: item.assetId };
    }
  }

  // One category per application: the questions and rules depend on it.
  const category = byId.get(input.items[0]!.assetId)!.category;
  if (input.items.some((i) => byId.get(i.assetId)!.category !== category)) {
    return { ok: false, reason: 'mixed_categories' };
  }

  const versions = new Set<number>();
  const lines: { assetId: string; quantity: number; unitCents: number }[] = [];
  for (const item of input.items) {
    const price = listPriceOn(priceLists, item.assetId, today);
    if (!price.ok) return { ok: false, reason: 'price_not_available', id: item.assetId };
    versions.add(price.priceListVersion);
    lines.push({ ...item, unitCents: price.priceCents });
  }
  // Same day, same list: a mix would mean the data is broken, so refuse rather than guess.
  if (versions.size !== 1) {
    return { ok: false, reason: 'price_not_available', id: input.items[0]!.assetId };
  }
  const priceListVersion = [...versions][0]!;
  const listPriceCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  // The same cap the quote and apply screens offer; the API must not accept more.
  const maxCents = maxDownPaymentCents(table, listPriceCents);
  if (input.downPaymentCents > maxCents) {
    return { ok: false, reason: 'down_payment_too_high', maxCents };
  }

  const quoted = quoteLease(table, {
    listPriceCents,
    downPaymentCents: input.downPaymentCents,
    termMonths: input.termMonths,
  });
  const financedCents = Math.max(0, listPriceCents - input.downPaymentCents);
  let monthlyGrossCents: Cents | null = null;
  if (quoted.ok) {
    const vat = vatRateOn(vatRates, today);
    if (!vat.ok) throw new Error(`no VAT rate on ${today}`);
    monthlyGrossCents = withVat(quoted.quote, vat.rateBp).monthlyGrossCents;
  }

  // Questions are hidden or shown by the deal, so prune on the server with the real deal.
  // The verified record answers its questions; whatever the client sent for them is replaced.
  const given = withRecordAnswers(base, input.answers);
  const deal = dealFor({
    customerType: base.type,
    category,
    financedCents,
    termMonths: input.termMonths,
  });
  const { answers, dropped } = pruneAnswers(questionsFile.questions, deal, given);
  const missing = missingQuestionIds(questionsFile.questions, deal, answers);
  if (missing.length > 0) return { ok: false, reason: 'missing_answers', ids: missing };
  const customer = customerFromAnswers(base, answers);
  const income = answers.q_monthly_income;
  const result = evaluateEligibility({
    customer,
    answers,
    startDate: today,
    financedCents,
    monthlyGrossRentCents: monthlyGrossCents,
    monthlyNetIncomeCents:
      typeof income === 'number' && Number.isSafeInteger(income) && income >= 0 ? income : null,
  });
  let { decision, reasons } = result;
  if (!quoted.ok && !reasons.some((r) => r.code === 'FINANCED_OUT_OF_RANGE')) {
    reasons = [...reasons, { code: 'FINANCED_OUT_OF_RANGE', rule_id: 'financed_limits' }];
    decision = 'rejected';
  }

  const applicationId = randomUUID(); // known up front so the audit row can name it
  await withAudit(
    db,
    {
      actor: input.customerId,
      action: 'application.submitted',
      entityType: 'application',
      entityId: applicationId,
      details: { decision, reasons: reasons.map((r) => r.code), items: input.items },
    },
    (tx) =>
      tx.application.create({
        data: {
          id: applicationId,
          customer_id: input.customerId,
          quoted_on: today,
          price_list_version: priceListVersion,
          list_price_cents: listPriceCents,
          down_payment_cents: input.downPaymentCents,
          term_months: input.termMonths,
          answers_json: JSON.stringify(answers),
          decision,
          reasons_json: JSON.stringify(reasons),
          items: {
            create: lines.map((l) => ({
              asset_id: l.assetId,
              list_price_cents: l.unitCents,
              quantity: l.quantity,
            })),
          },
        },
      })
  );
  return {
    ok: true,
    outcome: {
      applicationId,
      decision,
      reasons,
      quote: quoted.ok ? quoted.quote : null,
      monthlyGrossCents,
      droppedAnswers: dropped,
    },
  };
}
