// "Explain my price": each step of the calculation as a plain sentence and its amount.
import type { ExplainStep } from '@/domain/explain';
import { formatEuro } from '@/domain/money';
import { getT, type TranslateValues } from '@/i18n/get-t';
import { formatNumber } from '@/i18n/format';
import { intlLocale, type Locale } from '@/i18n/locales';

export function PriceExplanation({ locale, steps }: { locale: Locale; steps: ExplainStep[] }) {
  const t = getT(locale);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);

  /** The step's numbers, formatted for the sentence in this language. */
  function values(step: ExplainStep): TranslateValues {
    const p = step.params;
    const num = (v: string | number | undefined) => formatNumber(Number(v), locale);
    switch (step.id) {
      case 'down_payment':
        return { percent: num(p.percentOfPrice) };
      case 'financed':
        return {
          band: String(p.band),
          min: eur(Number(p.bandMinCents)),
          max: eur(Number(p.bandMaxCents)),
        };
      case 'factor':
        return {
          factor: new Intl.NumberFormat(intlLocale[locale], { minimumFractionDigits: 6 }).format(
            Number(p.factor)
          ),
          term: Number(p.termMonths),
          band: String(p.band),
          interest: num(p.annualInterestPercent),
        };
      case 'vat':
        return { rate: num(p.ratePercent) };
      case 'total_cost':
        return { term: Number(p.termMonths) };
      case 'buyout':
        return { percent: num(p.buyoutPercent), gross: eur(Number(p.buyoutGrossCents)) };
      default:
        return {};
    }
  }

  return (
    <section
      aria-labelledby="explain-title"
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 id="explain-title" className="text-xl font-semibold">
        {t('explain.title')}
      </h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('explain.intro')}</p>
      <ol className="mt-4 flex flex-col">
        {steps.map((step, i) => {
          const v = values(step);
          return (
            <li
              key={step.id}
              className={
                'flex items-start gap-3 border-b border-stone-100 py-3 last:border-b-0 dark:border-stone-800 ' +
                (step.emphasis ? '-mx-3 rounded-lg bg-stone-100 px-3 dark:bg-stone-800' : '')
              }
            >
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700 dark:bg-stone-700 dark:text-stone-200"
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{t(`explain.${step.id}.label`, v)}</span>
                <span className="text-sm text-stone-600 dark:text-stone-400">
                  {t(`explain.${step.id}.hint`, v)}
                </span>
              </span>
              <span
                className={
                  'shrink-0 text-right font-mono tabular-nums ' +
                  (step.emphasis ? 'font-semibold' : '')
                }
              >
                {step.id === 'factor'
                  ? v.factor
                  : step.id === 'down_payment' && step.amountCents
                    ? `− ${eur(step.amountCents)}`
                    : step.id === 'vat'
                      ? `+ ${eur(step.amountCents ?? 0)}`
                      : eur(step.amountCents ?? 0)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
