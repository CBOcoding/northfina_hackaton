// POST /api/second-life/:assetId/lease   lease a returned item again.
// Body: { actor }. Who gets it, the work and the price are decided on the server by the same
// rules the second-life page shows; the browser only asks for it.
import { z } from 'zod';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { db } from '@/server/db';
import { leaseSecondLife } from '@/server/second-life';
import { todayIso } from '@/server/today';

const bodySchema = z.strictObject({
  actor: z.string().trim().min(1).max(100),
});

export const POST = handleRoute(
  async (request, { params }: RouteContext<'/api/second-life/[assetId]/lease'>) => {
    const { assetId } = await params;
    const body = await readJsonBody(request, bodySchema);
    const result = await leaseSecondLife(db, { assetId, today: todayIso(), actor: body.actor });
    if (!result.ok) {
      if (result.reason === 'asset_not_found') {
        return fail(404, 'ASSET_NOT_FOUND', 'No asset with this id');
      }
      return fail(409, result.reason.toUpperCase(), 'This item cannot be leased again now', {
        reason: result.reason,
      });
    }
    return ok(result, { status: 201 });
  }
);
