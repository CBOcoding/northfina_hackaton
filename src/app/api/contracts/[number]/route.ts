// GET /api/contracts/:number   one contract with all its invoices.
import { fail, handleRoute, ok } from '@/server/api-response';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';

export const GET = handleRoute(
  async (_request, { params }: RouteContext<'/api/contracts/[number]'>) => {
    const { number } = await params;
    const stored = await getContract(db, number);
    if (!stored) return fail(404, 'CONTRACT_NOT_FOUND', `No contract with number "${number}"`);
    return ok(stored);
  }
);
