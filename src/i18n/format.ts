// Locale-aware formatting for the UI. For money use formatEuro from @/domain/money.
import { intlLocale, type Locale } from './locales';

/** `2026-11-06` → "6 November 2026" (en) / "6. marraskuuta 2026" (fi). */
export function formatIsoDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}

/** 18400 → "18,400" (en) / "18 400" (fi). */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale[locale]).format(value);
}
