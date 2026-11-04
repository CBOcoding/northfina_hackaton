// Translations. Add a key to ALL four files in ./messages (a test checks they match),
// then use it: `const t = getT(locale); t('catalogue.title')`.
import en from './messages/en.json';
import et from './messages/et.json';
import fi from './messages/fi.json';
import sv from './messages/sv.json';
import type { Locale } from './locales';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export const messages: Record<Locale, Messages> = { en, fi, sv, et };

export type TranslateValues = Record<string, string | number>;
export type Translate = (key: MessageKey, values?: TranslateValues) => string;

/** Returns `t(key, values?)` for a locale. `{name}` in a message is replaced by `values.name`. */
export function getT(locale: Locale): Translate {
  const dictionary = messages[locale];
  return (key, values) => interpolate(dictionary[key], values);
}

function interpolate(template: string, values?: TranslateValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}
