// GET /api/assets[?category=e_bike|laptop|farm_machine]
import { z } from 'zod';
import { assetCategorySchema } from '@/data/schemas';
import { handleRoute, ok } from '@/server/api-response';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';

const querySchema = z.object({ category: assetCategorySchema.optional() });

export const GET = handleRoute(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const { category } = querySchema.parse({ category: searchParams.get('category') ?? undefined });
  return ok(await listAssets(db, { category }));
});
