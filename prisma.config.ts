// Prisma 7 configuration: where the schema, migrations and seed live, and which database to use.
// Prisma 7 no longer reads .env by itself, so we load it here (variables already set win).
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` does not need a database, so fall back to the default
    // from .env.example instead of failing on a fresh clone.
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
});
