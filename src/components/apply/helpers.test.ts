import { describe, expect, it } from 'vitest';
import { centsToEuroText, eighteenthBirthday, parseEuroToCents } from './helpers';

describe('parseEuroToCents', () => {
  it('reads whole euros, commas, dots and spaces', () => {
    expect(parseEuroToCents('2500')).toBe(250_000);
    expect(parseEuroToCents(' 2 500,5 ')).toBe(250_050);
    expect(parseEuroToCents('12.05')).toBe(1_205);
    expect(parseEuroToCents('0')).toBe(0);
  });
  it('rejects anything that is not a plain amount', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '12.']) {
      expect(parseEuroToCents(bad), bad).toBeNull();
    }
  });
});

describe('centsToEuroText', () => {
  it('round-trips with parseEuroToCents', () => {
    for (const cents of [0, 5, 250_000, 250_050]) {
      expect(parseEuroToCents(centsToEuroText(cents))).toBe(cents);
    }
  });
});

describe('eighteenthBirthday', () => {
  it('adds 18 years, 29 Feb becomes 1 Mar, junk gives null', () => {
    expect(eighteenthBirthday('2009-03-10')).toBe('2027-03-10');
    expect(eighteenthBirthday('2008-02-29')).toBe('2026-03-01');
    expect(eighteenthBirthday('soon')).toBeNull();
  });
});
