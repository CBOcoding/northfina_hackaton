// Creates a Prisma client for a SQLite file. Prisma 7 talks to SQLite through a
// "driver adapter" (better-sqlite3) instead of a built-in engine.
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';

/** `databaseUrl` looks like `file:./dev.db`; a relative path is resolved from the current folder. */
export function createPrismaClient(databaseUrl = process.env.DATABASE_URL): PrismaClient {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Run `npm run db:setup` to create .env and the database.'
    );
  }
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
}

export type { PrismaClient };
