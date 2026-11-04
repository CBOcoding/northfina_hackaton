import { describe, expect, it } from 'vitest';
import { messages } from './get-t';
import { locales } from './locales';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translation files', () => {
  const englishKeys = Object.keys(messages.en).sort();

  it.each(locales)('%s has exactly the same keys as en', (locale) => {
    expect(Object.keys(messages[locale]).sort()).toEqual(englishKeys);
  });

  it.each(locales)('%s has no empty messages', (locale) => {
    for (const [key, text] of Object.entries(messages[locale])) {
      expect(text.trim(), `${locale}: ${key}`).not.toBe('');
    }
  });

  it.each(locales)('%s uses the same {placeholders} as en', (locale) => {
    for (const key of englishKeys) {
      const english = messages.en[key as keyof typeof messages.en];
      const translated = messages[locale][key as keyof typeof messages.en];
      expect(placeholders(translated), `${locale}: ${key}`).toEqual(placeholders(english));
    }
  });
});
