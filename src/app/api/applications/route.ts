// POST /api/applications
// body: { customerId, items: [{ assetId, quantity }], termMonths, downPaymentCents, answers }
// Prices and decides on the server: the client sends choices, never prices or a decision.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { createApplication } from '@/server/applications';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const bodySchema = z.strictObject({
  customerId: z.string().min(1),
  items: z
    .array(
      z.strictObject({ assetId: z.string().min(1), quantity: z.number().int().min(1).max(1000) })
    )
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.assetId)).size === items.length, {
      message: 'each asset may appear once; use quantity for several units',
    }),
  termMonths: z.union([z.literal(12), z.literal(24), z.literal(36), z.literal(48)]),
  downPaymentCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const result = await createApplication(db, body, todayIso());
  if (result.ok) return ok(result.outcome);
  if (result.reason === 'unknown_customer') {
    return fail(400, 'UNKNOWN_CUSTOMER', `No customer with id "${result.id}"`);
  }
  if (result.reason === 'asset_not_found') {
    return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${result.id}"`);
  }
  return fail(409, 'ASSET_NOT_AVAILABLE', `Asset "${result.id}" is not available`);
});
