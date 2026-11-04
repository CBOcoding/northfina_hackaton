// Creates .env from .env.example when .env is missing. Never overwrites an existing .env.
// Usage: node scripts/ensure-env.mjs
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} root folder that holds .env.example
 * @returns {'created' | 'exists'}
 */
export function ensureEnvFile(root) {
  const target = join(root, '.env');
  if (existsSync(target)) return 'exists';
  copyFileSync(join(root, '.env.example'), target);
  return 'created';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = ensureEnvFile(process.cwd());
  console.log(result === 'created' ? '📝 Created .env from .env.example' : '✔ .env already exists');
}
