// Fails when a hand-written source file is longer than 600 lines.
// Long files are hard to review in a pull request: split by responsibility instead.
// Usage: node scripts/check-file-size.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const MAX_LINES = 600;

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Paths that are generated, vendored or tests: not counted. */
const EXCLUDED = [
  /(^|\/)node_modules\//,
  /(^|\/)\.next\//,
  /(^|\/)coverage\//,
  /(^|\/)generated\//,
  /^prisma\/migrations\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)next-env\.d\.ts$/,
];

/** True when `path` (relative, forward slashes) is a source file we measure. */
export function isCheckedFile(path) {
  return SOURCE_EXTENSIONS.test(path) && !EXCLUDED.some((pattern) => pattern.test(path));
}

/** Number of lines in `text`; a final newline does not start a new line. */
export function countLines(text) {
  if (text === '') return 0;
  const lines = text.split('\n').length;
  return text.endsWith('\n') ? lines - 1 : lines;
}

/**
 * @param {string[]} paths candidate files
 * @param {(path: string) => string | null} read returns file text, or null if it is gone
 * @returns {{ path: string, lines: number }[]} files over the limit
 */
export function findOversizedFiles(paths, read, maxLines = MAX_LINES) {
  const oversized = [];
  for (const path of paths.filter(isCheckedFile)) {
    const text = read(path);
    if (text === null) continue;
    const lines = countLines(text);
    if (lines > maxLines) oversized.push({ path, lines });
  }
  return oversized;
}

/** Tracked files plus untracked files that are not ignored. */
function listRepositoryFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      encoding: 'utf8',
    }
  );
  return [...new Set(output.split('\0').filter(Boolean))];
}

function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null; // deleted but still in the index
    throw error;
  }
}

function main() {
  const oversized = findOversizedFiles(listRepositoryFiles(), readIfExists);
  if (oversized.length === 0) {
    console.log(`✅ No source file is over ${MAX_LINES} lines.`);
    return;
  }
  console.error(`❌ These files are over ${MAX_LINES} lines. Split them into smaller modules:\n`);
  for (const { path, lines } of oversized) console.error(`  ${path}: ${lines} lines`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
