// Everyone waiting for this kind of item: what they want, the rent we could offer them, and
// in plain words why they get it or not.
import { formatEuro } from '@/domain/money';
import type { SecondLifeCandidate } from '@/domain/second-life';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { tOr } from '@/components/apply/helpers';

type Props = {
  candidates: SecondLifeCandidate[];
  winnerId: string | null;
  locale: Locale;
  t: Translate;
};

export function WaitingList({ candidates, winnerId, locale, t }: Props) {
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const result = (c: SecondLifeCandidate) => {
    if (c.request.id === winnerId) return t('secondLife.result.winner');
    if (c.excludedBecause === null) return t('secondLife.result.eligible');
    return tOr(t, `secondLife.result.${c.excludedBecause}`, t('secondLife.result.other'));
  };

  return (
    <section aria-labelledby="waiting-title" className="mt-10">
      <h2 id="waiting-title" className="text-2xl font-semibold">
        {t('secondLife.waitTitle')}
      </h2>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-800">
        <table className="w-full min-w-[40rem] text-left text-base">
          <thead className="bg-stone-100 text-sm dark:bg-stone-800">
            <tr>
              <th scope="col" className="px-4 py-3">
                {t('secondLife.col.person')}
              </th>
              <th scope="col" className="px-4 py-3">
                {t('secondLife.col.wants')}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {t('secondLife.col.budget')}
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                {t('secondLife.col.rent')}
              </th>
              <th scope="col" className="px-4 py-3">
                {t('secondLife.col.result')}
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const won = c.request.id === winnerId;
              return (
                <tr
                  key={c.request.id}
                  className={`border-t border-stone-200 dark:border-stone-800 ${won ? 'bg-emerald-50 font-medium dark:bg-emerald-950' : ''}`}
                >
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="font-mono text-sm">{c.request.id}</span>
                    <span className="block">
                      {tOr(t, `secondLife.who.${c.request.id}`, c.request.who)}
                    </span>
                  </th>
                  <td className="px-4 py-3">
                    {t('secondLife.wants', {
                      condition: t(`condition.${c.request.min_condition}`),
                      term: c.request.preferred_term_months,
                      date: formatIsoDate(c.request.needed_by, locale),
                    })}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {eur(c.request.max_monthly_net_rent_cents)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {c.quote ? eur(c.quote.monthlyNetCents) : '–'}
                  </td>
                  <td className="px-4 py-3">{result(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('secondLife.waitNote')}</p>
    </section>
  );
}
