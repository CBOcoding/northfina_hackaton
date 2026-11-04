// GET /api/audit-log: the 50 newest audit rows, newest first.
import { handleRoute, ok } from '@/server/api-response';
import { listAuditLog } from '@/server/audit';
import { db } from '@/server/db';

export const GET = handleRoute(async () => ok(await listAuditLog(db, 50)));
