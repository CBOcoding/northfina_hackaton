// GET  /api/contracts   all contracts, newest first
// POST /api/contracts   sign a lease. Body: { customerId, signedBy, items: [{ assetId, quantity? }], quotedOn,
//                       signedOn?, startDate?, downPaymentCents, termMonths, applicationId?, actor }
// Signing writes the contract, its invoices and an audit row in one transaction.
import { z } from 'zod';
import { isoDateSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { listContracts, loadLeaseData, signLease } from '@/server/contracts';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const bodySchema = z.strictObject({
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

export const GET = handleRoute(async () => ok(await listContracts(db)));

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const result = await signLease(db, await loadLeaseData(), {
    ...body,
    signedOn: body.signedOn ?? todayIso(),
  });
  if (!result.ok) {
    return fail(422, result.reason.toUpperCase(), 'The lease cannot be signed', {
      reason: result.reason,
    });
  }
  return ok({ ...result.stored, lock: result.lock }, { status: 201 });
});
