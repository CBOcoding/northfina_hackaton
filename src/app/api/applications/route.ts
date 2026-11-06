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
      // Every item is unique: one unit per item.
      z.strictObject({ assetId: z.string().min(1), quantity: z.number().int().min(1).max(1) })
    )
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.assetId)).size === items.length, {
      message: 'each asset may appear once',
    }),
  termMonths: z.union([z.literal(12), z.literal(24), z.literal(36), z.literal(48)]),
  downPaymentCents: z.number().int().min(0).max(2_147_483_647),
  // Bounded: answers are stored as JSON.
  answers: z
    .record(
      z.string().max(100),
      z.union([z.string().max(500), z.number(), z.array(z.string().max(500)).max(20)])
    )
    .refine((a) => Object.keys(a).length <= 50, { message: 'at most 50 answers' }),
});

export const POST = handleRoute(async (request) => {
  const body = await readJsonBody(request, bodySchema);
  const result = await createApplication(db, body, todayIso());
  if (result.ok) return ok(result.outcome);
  switch (result.reason) {
    case 'unknown_customer':
      return fail(400, 'UNKNOWN_CUSTOMER', 'Unknown customer');
    case 'mixed_categories':
      return fail(400, 'MIXED_CATEGORIES', 'All items must be in the same category');
    case 'missing_answers':
      return fail(400, 'MISSING_ANSWERS', 'Some questions are not answered', result.ids);
    case 'asset_not_found':
      return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${result.id}"`);
    case 'price_not_available':
      return fail(409, 'PRICE_NOT_AVAILABLE', `No list price for asset "${result.id}" today`);
    case 'down_payment_too_high':
      return fail(
        400,
        'DOWN_PAYMENT_TOO_HIGH',
        'The down payment is above the maximum',
        result.maxCents
      );
    case 'asset_not_available':
      return fail(409, 'ASSET_NOT_AVAILABLE', `Asset "${result.id}" is not available`);
  }
});
