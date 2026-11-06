// GET  /api/contracts   all contracts, newest first
// POST /api/contracts   sign an approved application. Body: { applicationId, signedBy, actor }
// Signing writes the contract, its invoices and an audit row in one transaction. There is no
// direct lease body: every contract goes through an application that passed eligibility.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { listContracts, loadLeaseData, signApplication } from '@/server/contracts';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

// The browser sends only who signs. Items, terms and the quote date are read from the stored
// application, so they cannot be changed on the way.
const bodySchema = z.strictObject({
  applicationId: z.string().min(1),
  signedBy: z.string().trim().min(1).max(200),
  actor: z.string().trim().min(1).max(100),
});

export const GET = handleRoute(async () => ok(await listContracts(db)));

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const data = await loadLeaseData();
  const result = await signApplication(db, data, { ...body, signedOn: todayIso() });
  if (!result.ok) {
    return fail(422, result.reason.toUpperCase(), 'The lease cannot be signed', {
      reason: result.reason,
    });
  }
  return ok({ ...result.stored, lock: result.lock }, { status: 201 });
});
