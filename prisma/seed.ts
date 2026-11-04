// Fills the database from the data pack. Run by `npm run db:setup` (via `prisma db seed`).
// Safe to run again: it only adds assets that are missing and never overwrites your changes.
import { loadAssets } from '@/data/load';
import { seedAssets } from '@/server/assets';
import { createPrismaClient } from '@/server/prisma-client';

const db = createPrismaClient();
try {
  const { created, skipped } = await seedAssets(db, await loadAssets());
  console.log(`🌱 Seeded ${created} new assets (${skipped} were already there).`);
} finally {
  await db.$disconnect();
}
