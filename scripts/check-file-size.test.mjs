import { describe, expect, it } from 'vitest';
import { countLines, findOversizedFiles, isCheckedFile, MAX_LINES } from './check-file-size.mjs';

describe('isCheckedFile', () => {
  it.each([
    'src/domain/pricing.ts',
    'src/app/[locale]/page.tsx',
    'scripts/check-no-ai.mjs',
    'eslint.config.mjs',
    'legacy/old.cjs',
    'src/widget.jsx',
  ])('checks %s', (path) => {
    expect(isCheckedFile(path)).toBe(true);
  });

  it.each([
    'src/domain/pricing.test.ts',
    'scripts/check-file-size.test.mjs',
    'src/app/page.spec.tsx',
    'prisma/migrations/20260101_init/migration.sql',
    'prisma/migrations/x/helper.ts',
    'src/generated/prisma/client.ts',
    'node_modules/zod/index.js',
    '.next/server/app.js',
    'next-env.d.ts',
    'data/assets.json',
    'README.md',
  ])('skips %s', (path) => {
    expect(isCheckedFile(path)).toBe(false);
  });
});

describe('countLines', () => {
  it('does not count the final newline as a line', () => {
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('')).toBe(0);
  });
});

describe('findOversizedFiles', () => {
  const files = {
    'src/ok.ts': 'x\n'.repeat(MAX_LINES),
    'src/too-long.ts': 'x\n'.repeat(MAX_LINES + 1),
    'src/too-long.test.ts': 'x\n'.repeat(5000),
  };
  const read = (path) => files[path] ?? null;

  it('reports only measured files above the limit', () => {
    expect(findOversizedFiles(Object.keys(files), read)).toEqual([
      { path: 'src/too-long.ts', lines: MAX_LINES + 1 },
    ]);
  });

  it('skips files that no longer exist', () => {
    expect(findOversizedFiles(['src/deleted.ts'], read)).toEqual([]);
  });

  it('accepts a custom limit', () => {
    expect(findOversizedFiles(['src/ok.ts'], read, 10)).toHaveLength(1);
  });
});
