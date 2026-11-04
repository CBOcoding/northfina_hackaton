// Prints coverage/coverage-summary.json (written by `npm run test:coverage`) as a
// Markdown table. CI appends it to the job summary on GitHub.
// Usage: node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const METRICS = ['lines', 'statements', 'functions', 'branches'];

/** @param {{ total: Record<string, { pct: number, covered: number, total: number }> }} summary */
export function toMarkdown(summary) {
  const rows = METRICS.map((metric) => {
    const { pct, covered, total } = summary.total[metric];
    return `| ${metric} | ${pct}% | ${covered} / ${total} |`;
  });
  return [
    '### Test coverage',
    '',
    '| Metric | Covered | Count |',
    '| --- | ---: | ---: |',
    ...rows,
  ].join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2] ?? 'coverage/coverage-summary.json';
  console.log(toMarkdown(JSON.parse(readFileSync(file, 'utf8'))));
}
