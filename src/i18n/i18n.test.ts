import { describe, expect, it } from 'vitest';
import { formatIsoDate, formatNumber } from './format';
import { getT } from './get-t';
import { defaultLocale, isLocale, locales } from './locales';

const plain = (text: string) => text.replace(/\s/g, ' ');

describe('isLocale', () => {
  it('accepts the four app languages', () => {
    expect(locales.every(isLocale)).toBe(true);
    expect(isLocale(defaultLocale)).toBe(true);
  });

  it('rejects anything else, including other casing and regions', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale('EN')).toBe(false);
    expect(isLocale('fi-FI')).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});

describe('getT', () => {
  it('returns the message for the locale', () => {
    expect(getT('en')('catalogue.title')).toBe('Catalogue');
    expect(getT('fi')('catalogue.title')).toBe('Valikoima');
  });

  it('fills in {placeholders}', () => {
    expect(getT('en')('catalogue.itemCount', { count: 12 })).toBe('12 items');
  });

  it('leaves a placeholder visible when its value is missing', () => {
    expect(getT('en')('catalogue.itemCount', {})).toBe('{count} items');
  });
});

describe('formatting', () => {
  it('formats ISO dates per locale without shifting the day', () => {
    expect(formatIsoDate('2026-11-06', 'en')).toBe('6 November 2026');
    expect(formatIsoDate('2026-11-06', 'fi')).toBe('6. marraskuuta 2026');
  });

  it('formats numbers per locale', () => {
    expect(formatNumber(18_400, 'en')).toBe('18,400');
    expect(plain(formatNumber(18_400, 'fi'))).toBe('18 400');
  });
});
