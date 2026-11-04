// The app's one Prisma client. Import `db` from here in routes and pages.
// In development Next.js reloads modules on every change; keeping the client on
// globalThis stops each reload from opening another database connection.
import { createPrismaClient, type PrismaClient } from './prisma-client';

const globalForPrisma = globalThis as typeof globalThis & { leaseLoopDb?: PrismaClient };

export const db: PrismaClient = globalForPrisma.leaseLoopDb ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.leaseLoopDb = db;
}
