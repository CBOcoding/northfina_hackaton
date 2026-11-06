// POST /api/contracts/:number/end   end the contract at the end of its term.
// Body: { choice: "buy" | "return" | "pass_on", actor, reports?: { "<assetId>": { condition, usageValue } } }
// Return and pass on need a condition report for every item. The end date is computed here
// from the contract (start + term), never taken from the browser.
import { z } from 'zod';
import { loadVatRates } from '@/data/load';
import { assetConditionSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { endContract } from '@/server/end-of-term';

const bodySchema = z.strictObject({
  choice: z.enum(['buy', 'return', 'pass_on']),
  actor: z.string().trim().min(1).max(100),
  reports: z
    .record(
      z.string().min(1).max(100),
      z.strictObject({
        condition: assetConditionSchema,
        usageValue: z.number().int().nonnegative().max(10_000_000),
      })
    )
    .refine((r) => Object.keys(r).length <= 50, { message: 'at most 50 reports' })
    .optional(),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/contracts/[number]/end'>) => {
    const { number } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await endContract(db, await loadVatRates(), { number, ...body });
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return fail(404, 'CONTRACT_NOT_FOUND', 'No contract with this number');
      }
      return fail(422, result.reason.toUpperCase(), 'The contract cannot be ended this way', {
        reason: result.reason,
      });
    }
    return ok(result);
  }
);
