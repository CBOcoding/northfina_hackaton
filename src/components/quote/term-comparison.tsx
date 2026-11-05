// "24 or 36 months?": the same item and down payment priced for two terms, side by side.
import type { TermComparison as Comparison } from '@/domain/explain';
import { formatEuro } from '@/domain/money';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export function TermComparison({ locale, comparison }: { locale: Locale; comparison: Comparison }) {
  const t = getT(locale);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [a, b] = comparison.options;
  if (!a || !b) return null;

  const rows = [
    { label: t('compare.monthly'), pick: 'monthly' as const },
    { label: t('compare.net'), pick: 'net' as const },
    { label: t('compare.total'), pick: 'total' as const },
    { label: t('compare.buyout'), pick: 'buyout' as const },
  ];
  const value = (o: typeof a, pick: (typeof rows)[number]['pick']) => {
    if (!o.ok) return t('compare.notAvailable');
    const p = o.priced;
    return eur(
      pick === 'monthly'
        ? p.monthlyGrossCents
        : pick === 'net'
          ? p.quote.monthlyNetCents
          : pick === 'total'
            ? p.totalCostCents
            : p.buyoutGrossCents
    );
  };
  const best = (o: typeof a, pick: (typeof rows)[number]['pick']) =>
    (pick === 'monthly' && o.termMonths === comparison.lowestMonthlyTerm) ||
    (pick === 'total' && o.termMonths === comparison.lowestTotalTerm);

  return (
    <section
      aria-labelledby="compare-title"
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="compare-title" className="text-xl font-semibold">
        {t('compare.title', { a: a.termMonths, b: b.termMonths })}
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('compare.intro')}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700">
              <td className="py-2" />
              {[a, b].map((o) => (
                <th key={o.termMonths} scope="col" className="py-2 text-right font-semibold">
                  {t('compare.termHeader', { term: o.termMonths })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.pick} className="border-b border-stone-100 dark:border-stone-800">
                <th scope="row" className="py-2.5 font-normal text-stone-600 dark:text-stone-400">
                  {row.label}
                </th>
                {[a, b].map((o) => (
                  <td
                    key={o.termMonths}
                    className={
                      'py-2.5 text-right font-mono tabular-nums ' +
                      (best(o, row.pick)
                        ? 'font-semibold text-emerald-800 dark:text-emerald-300'
                        : '')
                    }
                  >
                    {value(o, row.pick)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comparison.lowestMonthlyTerm !== null && comparison.lowestTotalTerm !== null ? (
        <ul className="mt-4 flex flex-col gap-1 text-sm">
          <li>{t('compare.lowerMonthly', { term: comparison.lowestMonthlyTerm })}</li>
          <li>{t('compare.lowerTotal', { term: comparison.lowestTotalTerm })}</li>
        </ul>
      ) : null}
    </section>
  );
}
