// Which VAT rate applies on a day. Rates are ranges with inclusive ends; `valid_to: null`
// means the rate is still valid. The result is in basis points (25.5 % → 2550).
import type { VatRates } from '@/data/schemas';
import { parseIsoDate } from './calendar';
import { percentToBasisPoints } from './money';
import type { IsoDate } from './types';

export type VatRateResult =
  | { ok: true; rateBp: number; validFrom: IsoDate; fictional: boolean }
  | { ok: false; reason: 'no_rate_on_date' };

export function vatRateOn(vatRates: VatRates, isoDate: IsoDate): VatRateResult {
  parseIsoDate(isoDate); // throws on a malformed date: that is a bug in the caller
  // ISO dates sort the same way as the days they name, so string comparison works.
  const rate = vatRates.rates.find(
    (r) => r.valid_from <= isoDate && (r.valid_to === null || isoDate <= r.valid_to)
  );
  if (!rate) return { ok: false, reason: 'no_rate_on_date' };
  return {
    ok: true,
    rateBp: percentToBasisPoints(rate.rate_percent),
    validFrom: rate.valid_from,
    fictional: rate.fictional ?? false,
  };
}
