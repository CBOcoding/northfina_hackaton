import { describe, expect, it } from 'vitest';
import { todayIso } from './today';

describe('todayIso', () => {
  it('returns the date in Helsinki, not in UTC', () => {
    // 22:30 UTC on 5 November is already 6 November in Helsinki (UTC+2 in winter).
    expect(todayIso(new Date('2026-11-05T22:30:00Z'))).toBe('2026-11-06');
    expect(todayIso(new Date('2026-11-05T21:30:00Z'))).toBe('2026-11-05');
  });

  it('can use another time zone', () => {
    expect(todayIso(new Date('2026-11-05T22:30:00Z'), 'UTC')).toBe('2026-11-05');
  });

  it('uses the real clock by default', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
