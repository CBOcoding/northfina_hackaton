import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  dayBefore,
  daysInMonth,
  formatIsoDate,
  isLeapYear,
  parseIsoDate,
} from './calendar';

describe('isLeapYear and daysInMonth', () => {
  it('knows the Gregorian leap-year rule', () => {
    expect([2024, 2028, 2000].map(isLeapYear)).toEqual([true, true, true]);
    expect([2026, 2027, 1900, 2100].map(isLeapYear)).toEqual([false, false, false, false]);
  });

  it('gives 28 or 29 days for February and fixed lengths otherwise', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('throws on a month outside 1–12', () => {
    expect(() => daysInMonth(2026, 0)).toThrow(RangeError);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });
});

describe('parseIsoDate', () => {
  it('reads valid dates', () => {
    expect(parseIsoDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('rejects malformed and impossible dates', () => {
    for (const bad of ['2026-2-1', '2026-02-29', '2026-13-01', '2026-04-31', '31.1.2026']) {
      expect(() => parseIsoDate(bad)).toThrow(RangeError);
    }
  });

  it('round-trips through formatIsoDate', () => {
    expect(formatIsoDate(parseIsoDate('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('addMonthsClamped (card 4: a lease starting 31 Jan 2026)', () => {
  it('is due on the last day of February, 28 in 2026 and 29 in the leap year 2028', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 25)).toBe('2028-02-29');
  });

  it('returns to the 31st after a short month and clamps 30-day months', () => {
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
  });

  it('crosses years and keeps ordinary days', () => {
    expect(addMonthsClamped('2026-11-05', 2)).toBe('2027-01-05');
    expect(addMonthsClamped('2026-09-15', 0)).toBe('2026-09-15');
  });

  it('throws on a negative or fractional month count', () => {
    expect(() => addMonthsClamped('2026-01-31', -1)).toThrow(RangeError);
    expect(() => addMonthsClamped('2026-01-31', 1.5)).toThrow(RangeError);
  });

  it('always lands in the right month, on the start day or the month end (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2035 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 0, max: 60 }),
        (year, month, rawDay, k) => {
          const day = Math.min(rawDay, daysInMonth(year, month));
          const start = formatIsoDate({ year, month, day });
          const due = parseIsoDate(addMonthsClamped(start, k));
          const index = month - 1 + k;
          expect(due.year).toBe(year + Math.floor(index / 12));
          expect(due.month).toBe((index % 12) + 1);
          expect(due.day).toBe(Math.min(day, daysInMonth(due.year, due.month)));
        }
      )
    );
  });
});

describe('dayBefore', () => {
  it('steps back across months, leap days and years', () => {
    expect(dayBefore('2026-11-06')).toBe('2026-11-05');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2028-03-01')).toBe('2028-02-29');
    expect(dayBefore('2027-01-01')).toBe('2026-12-31');
  });
});
