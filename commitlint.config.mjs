/**
 * Commit messages follow Conventional Commits: `type(optional-scope): subject`.
 * Examples: `feat(pricing): add factor lookup`, `fix(ui): show VAT on the price`.
 * Used by the commit-msg hook and by CI. Merge and revert messages are ignored.
 */
const config = {
  extends: ['@commitlint/config-conventional'],
  defaultIgnores: true,
  helpUrl: 'https://www.conventionalcommits.org/en/v1.0.0/',
  rules: {
    // Only the header is strict: bodies and footers may hold long lines.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    // Allow "feat: Add X" as well as "feat: add X".
    'subject-case': [0],
  },
};

export default config;
