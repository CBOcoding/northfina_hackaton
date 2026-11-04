// Installs the Git hooks in .husky/ when you run `npm install`.
// Skipped in CI and when there is no .git folder (for example a downloaded zip).
import { existsSync } from 'node:fs';

if (process.env.CI || !existsSync('.git')) {
  process.exit(0);
}

const { default: husky } = await import('husky');
const message = husky();
if (message) console.log(message);
