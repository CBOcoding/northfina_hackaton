// Small pure helpers for the apply form. Money stays integer cents; the form shows euros.
import { messages, type MessageKey, type Translate } from '@/i18n/get-t';
import type { IsoDate, TermMonths } from '@/domain/types';

export const TERMS: readonly TermMonths[] = [12, 24, 36, 48];

/** "2500", "2 500,50", "12.5" → integer cents. `null` when it is not a plain amount. */
export function parseEuroToCents(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.');
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Integer cents → text for an input: 250000 → "2500", 250050 → "2500.50". */
export function centsToEuroText(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, '0')}`;
}

/** The day someone born on `birthDate` turns 18. Born 29 Feb → 1 Mar (always a non-leap year). */
export function eighteenthBirthday(birthDate: IsoDate): IsoDate | null {
  const match = /^(\d{4})-(\d{2}-\d{2})$/.exec(birthDate);
  if (!match) return null;
  return `${Number(match[1]) + 18}-${match[2] === '02-29' ? '03-01' : match[2]}`;
}

/** `t` for a key built at run time (reason codes, option ids); `fallback` if there is none. */
export function tOr(t: Translate, key: string, fallback: string): string {
  return key in messages.en ? t(key as MessageKey) : fallback;
}
