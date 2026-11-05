// GET  /api/contracts   all contracts, newest first
// POST /api/contracts   sign an approved application. Body: { applicationId, signedBy, actor }
// POST /api/contracts   sign a lease. Body: { customerId, signedBy, items: [{ assetId, quantity? }], quotedOn,
//                       signedOn?, startDate?, downPaymentCents, termMonths, applicationId?, actor }
// Signing writes the contract, its invoices and an audit row in one transaction.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { listContracts, loadLeaseData, signApplication, signLease } from '@/server/contracts';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const leaseSchema = z.strictObject({
  customerId: z.string().trim().min(1).max(100),
  signedBy: z.string().trim().min(1).max(200),
  items: z
    .array(
      z.strictObject({
        assetId: z.string().trim().min(1),
        quantity: z.number().int().min(1).max(500).optional(),
      })
    )
    .min(1)
    .max(50),
  quotedOn: isoDateSchema,
  signedOn: isoDateSchema.optional(),
  startDate: isoDateSchema.optional(),
  downPaymentCents: z.number().int().nonnegative(),
  termMonths: z.number().int(),
  applicationId: z.string().min(1).optional(),
  actor: z.string().trim().min(1).max(100),
});

// Signing an approved application: the browser sends only who signs. Items, terms and the
// quote date are read from the stored application, so they cannot be changed on the way.
const applicationSchema = z.strictObject({
  applicationId: z.string().min(1),
  signedBy: z.string().trim().min(1).max(200),
  actor: z.string().trim().min(1).max(100),
});

const bodySchema = z.union([applicationSchema, leaseSchema]);

export const GET = handleRoute(async () => ok(await listContracts(db)));

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const data = await loadLeaseData();
  const result =
    'customerId' in body
      ? await signLease(db, data, { ...body, signedOn: body.signedOn ?? todayIso() })
      : await signApplication(db, data, { ...body, signedOn: todayIso() });
  if (!result.ok) {
    return fail(422, result.reason.toUpperCase(), 'The lease cannot be signed', {
      reason: result.reason,
    });
  }
  return ok({ ...result.stored, lock: result.lock }, { status: 201 });
});
