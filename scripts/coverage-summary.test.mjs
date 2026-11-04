import { describe, expect, it } from 'vitest';
import { toMarkdown } from './coverage-summary.mjs';

describe('toMarkdown', () => {
  it('renders one row per metric', () => {
    const metric = (pct) => ({ pct, covered: pct, total: 100 });
    const markdown = toMarkdown({
      total: {
        lines: metric(91.5),
        statements: metric(90),
        functions: metric(88),
        branches: metric(75),
      },
    });
    expect(markdown).toContain('| lines | 91.5% | 91.5 / 100 |');
    expect(markdown).toContain('| branches | 75% | 75 / 100 |');
    expect(markdown.split('\n')).toHaveLength(8);
  });
});
