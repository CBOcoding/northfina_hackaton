'use client';

// Links to the same page in each language: /fi/anything → /en/anything.
// A client component only because it needs the current path.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localeNames, locales, type Locale } from '@/i18n/locales';

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const rest = pathname.split('/').slice(2).join('/');

  return (
    <nav aria-label={label}>
      <ul className="flex gap-1 rounded-full bg-stone-100 p-1 dark:bg-stone-800">
        {locales.map((locale) => {
          const active = locale === current;
          return (
            <li key={locale}>
              <Link
                href={rest ? `/${locale}/${rest}` : `/${locale}`}
                hrefLang={locale}
                lang={locale}
                aria-current={active ? 'page' : undefined}
                className={
                  'block rounded-full px-3 py-1.5 text-sm font-medium uppercase transition-colors ' +
                  (active
                    ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-950 dark:text-white'
                    : 'text-stone-700 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white')
                }
              >
                <span aria-hidden="true">{locale}</span>
                <span className="sr-only">{localeNames[locale]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
