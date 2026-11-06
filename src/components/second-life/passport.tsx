// The item's passport: every life it has had, and the CO₂ each reuse saved.
import Link from 'next/link';
import type { CircularImpact } from '@/domain/circular-impact';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type PassportContract = { number: string; signedOn: string; lifeNumber: number };

type Props = {
  previousLives: number;
  contracts: PassportContract[];
  nextWho: string | null;
  impact: CircularImpact;
  locale: Locale;
  t: Translate;
};

export function Passport({ previousLives, contracts, nextWho, impact, locale, t }: Props) {
  const kg = (grams: number) =>
    new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 1 }).format(grams / 1000);
  const co2 = new Map(impact.lives.map((l) => [l.life, l]));
  const co2Line = (life: number) => {
    const entry = co2.get(life);
    if (!entry) return null;
    return (
      <span className="block text-sm text-stone-700 dark:text-stone-300">
        {t('secondLife.co2Life', { kg: kg(entry.avoidedGrams) })} ·{' '}
        {t(`secondLife.co2.${entry.method}`)}
      </span>
    );
  };

  return (
    <section aria-labelledby="passport-title" className="mt-10">
      <h2 id="passport-title" className="text-2xl font-semibold">
        {t('secondLife.passportTitle')}
      </h2>
      <ol className="mt-4 space-y-3 border-l-2 border-emerald-700 pl-5 dark:border-emerald-400">
        {/* A life with a contract in our database is shown by that contract below. */}
        {Array.from({ length: previousLives }, (_, i) => i + 1)
          .filter((n) => !contracts.some((c) => c.lifeNumber === n))
          .map((n) => (
            <li key={`before-${n}`}>
              {t('secondLife.life.before', { n })}
              {co2Line(n)}
            </li>
          ))}
        {contracts.map((c) => (
          <li key={c.number}>
            <Link
              href={`/${locale}/contracts/${c.number}`}
              className="font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
            >
              {t('secondLife.life.contract', {
                n: c.lifeNumber,
                number: c.number,
                date: formatIsoDate(c.signedOn, locale),
              })}
            </Link>
            {co2Line(c.lifeNumber)}
          </li>
        ))}
        {nextWho ? (
          <li className="font-medium">
            {t('secondLife.life.next', { n: previousLives + 1, who: nextWho })}
            {co2Line(previousLives + 1)}
          </li>
        ) : null}
      </ol>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950">
          <dt className="text-sm">{t('secondLife.co2SoFar')}</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {kg(impact.savedSoFarGrams)} kg CO₂e
          </dd>
        </div>
        {/* Only a returned item with someone to lease it has a next life. */}
        {nextWho ? (
          <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950">
            <dt className="text-sm">{t('secondLife.co2WithNext')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {kg(impact.savedWithNextGrams)} kg CO₂e
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">{t('secondLife.co2Method')}</p>
    </section>
  );
}
