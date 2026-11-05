// Finnish business ID (Y-tunnus) check digit, using the public mod-11 algorithm.
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2] as const;

/**
 * True when `id` is exactly `NNNNNNN-C` and C is the right check digit:
 * weighted sum of the 7 digits (weights 7, 9, 10, 5, 8, 4, 2) mod 11 = r;
 * r = 0 → C = 0, r = 1 → no valid ID uses this number, otherwise C = 11 − r.
 * No trimming or reformatting: the caller cleans user input first.
 */
export function isValidFinnishBusinessId(id: string): boolean {
  const match = /^(\d{7})-(\d)$/.exec(id);
  if (!match) return false;
  const [, digits = '', check = ''] = match;
  const sum = WEIGHTS.reduce((acc, weight, i) => acc + weight * Number(digits[i]), 0);
  const remainder = sum % 11;
  if (remainder === 1) return false;
  return (remainder === 0 ? 0 : 11 - remainder) === Number(check);
}
