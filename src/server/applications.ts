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
import { customerFromAnswers, dealFor } from '@/domain/application';
import { evaluateEligibility, type Reason } from '@/domain/eligibility';
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
  | {
      ok: false;
      reason: 'unknown_customer' | 'asset_not_found' | 'asset_not_available';
      id: string;
    };

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
  if (!base) return { ok: false, reason: 'unknown_customer', id: input.customerId };

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

  let priceListVersion = 0;
  const lines = input.items.map((item) => {
    const price = listPriceOn(priceLists, item.assetId, today);
    if (!price.ok)
      throw new Error(`no list price for ${item.assetId} on ${today}: ${price.reason}`);
    priceListVersion = price.priceListVersion;
    return { ...item, unitCents: price.priceCents };
  });
  const listPriceCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);

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
  const category = byId.get(input.items[0]!.assetId)!.category;
  const customerType = (input.answers.q_customer_type as string | undefined) ?? base.type;
  const { answers, dropped } = pruneAnswers(
    questionsFile.questions,
    dealFor({ customerType, category, financedCents, termMonths: input.termMonths }),
    input.answers
  );
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
