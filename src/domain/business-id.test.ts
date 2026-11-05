import { describe, expect, it } from 'vitest';
import { isValidFinnishBusinessId } from './business-id';

describe('isValidFinnishBusinessId', () => {
  it('rejects 1234567-8: sum 153, remainder 10, so the check digit must be 1', () => {
    expect(isValidFinnishBusinessId('1234567-8')).toBe(false);
    expect(isValidFinnishBusinessId('1234567-1')).toBe(true);
  });

  it.each(['3012456-5', '3187650-7', '2876543-5', '3299871-7'])(
    'accepts the data-pack business ID %s',
    (id) => {
      expect(isValidFinnishBusinessId(id)).toBe(true);
    }
  );

  it('uses check digit 0 when the remainder is 0 (1000002: 7 + 4 = 11)', () => {
    expect(isValidFinnishBusinessId('1000002-0')).toBe(true);
    expect(isValidFinnishBusinessId('1000002-1')).toBe(false);
  });

  it('rejects every check digit when the remainder is 1 (1000008: 7 + 16 = 23)', () => {
    for (let digit = 0; digit <= 9; digit++) {
      expect(isValidFinnishBusinessId(`1000008-${digit}`)).toBe(false);
    }
  });

  it.each(['', '30124565', '3012456-', '301245-5', '03012456-5', ' 3012456-5', '3012456 5'])(
    'rejects the malformed value "%s"',
    (id) => {
      expect(isValidFinnishBusinessId(id)).toBe(false);
    }
  );
});
