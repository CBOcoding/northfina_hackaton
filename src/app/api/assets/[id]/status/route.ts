// PATCH /api/assets/:id/status   body: { "status": "reserved", "actor": "team-kettu" }
// Changes the status and writes an audit row in the same transaction. An item in an active
// contract cannot be changed here (409), so it cannot be freed and leased twice.
// There is no login in the starter, so `actor` is whatever the caller says.
import { z } from 'zod';
import { assetStatusSchema } from '@/data/schemas';
import { fail, handleRoute, ok, readJsonBody } from '@/server/api-response';
import { changeAssetStatus } from '@/server/assets';
import { db } from '@/server/db';

const bodySchema = z.strictObject({
  status: assetStatusSchema,
  actor: z.string().trim().min(1).max(100),
});

export const PATCH = handleRoute(
  async (request, { params }: RouteContext<'/api/assets/[id]/status'>) => {
    const { id } = await params;
    const body = await readJsonBody(request, bodySchema);

    const result = await changeAssetStatus(db, { id, status: body.status, actor: body.actor });
    if (!result.ok && result.reason === 'under_contract')
      return fail(409, 'ASSET_UNDER_CONTRACT', `Asset "${id}" is in an active contract`);
    if (!result.ok) return fail(404, 'ASSET_NOT_FOUND', `No asset with id "${id}"`);

    return ok(result.asset);
  }
);
