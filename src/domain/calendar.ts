// Calendar maths on ISO dates (`YYYY-MM-DD`), with no Date objects and no time zones.
//
// Billing rule: invoice k of a lease is due on the start day of month k, and when that
// month is shorter the due date moves to its last day. The start day stays the anchor:
// a lease from 31 Jan is due 28 Feb (29 in a leap year), then 31 Mar again.
import type { IsoDate } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type Ymd = { year: number; month: number; day: number };

/** Splits an ISO date and checks that the day exists (no 30 February). */
export function parseIsoDate(iso: IsoDate): Ymd {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new RangeError(`date must look like YYYY-MM-DD, got "${iso}"`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`not a real date: "${iso}"`);
  }
  return { year, month, day };
}

export function formatIsoDate({ year, month, day }: Ymd): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Gregorian leap years: every 4th year, except centuries not divisible by 400. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Days in `month` (1–12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  const days = DAYS[month - 1];
  if (days === undefined || !Number.isInteger(month)) {
    throw new RangeError(`month must be 1–12, got ${month}`);
  }
  return month === 2 && isLeapYear(year) ? 29 : days;
}

/**
 * The date `months` calendar months after `start`, on the start's day of month, or on the
 * last day of the target month when it is shorter. `months` may be 0 (returns `start`).
 */
export function addMonthsClamped(start: IsoDate, months: number): IsoDate {
  if (!Number.isInteger(months) || months < 0) {
    throw new RangeError(`months must be a whole number ≥ 0, got ${months}`);
  }
  const { year, month, day } = parseIsoDate(start);
  const index = month - 1 + months;
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return formatIsoDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

/** The day before `iso`: 2026-03-01 → 2026-02-28. */
export function dayBefore(iso: IsoDate): IsoDate {
  const { year, month, day } = parseIsoDate(iso);
  if (day > 1) return formatIsoDate({ year, month, day: day - 1 });
  if (month > 1)
    return formatIsoDate({ year, month: month - 1, day: daysInMonth(year, month - 1) });
  return formatIsoDate({ year: year - 1, month: 12, day: 31 });
}

/**
 * Days since 1970-01-01 for an ISO date (negative before). Pure arithmetic on the
 * Gregorian calendar, so no Date object and no time zone can shift the answer.
 */
export function toEpochDay(iso: IsoDate): number {
  const { year, month, day } = parseIsoDate(iso);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/** Whole days from `from` to `to`: 2026-11-05 → 2026-11-06 is 1. Negative if `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}
