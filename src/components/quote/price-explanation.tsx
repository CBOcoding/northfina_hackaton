'use client';

// "Explain my price": each step of the calculation and its amount. The headline of every step
// is always shown; the plain-language detail under each one opens with the toggle.
import { useId, useState } from 'react';
import type { ExplainStep } from '@/domain/explain';
import { formatEuro } from '@/domain/money';
import { getT, type MessageKey, type TranslateValues } from '@/i18n/get-t';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { intlLocale, type Locale } from '@/i18n/locales';

export function PriceExplanation({ locale, steps }: { locale: Locale; steps: ExplainStep[] }) {
  const t = getT(locale);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  // Keys are built from the step id; every step id has its label and hint in the message files.
  const say = (key: string, v: TranslateValues) => t(key as MessageKey, v);
  const todayRate = steps.find((s) => s.id === 'vat')?.params.ratePercent;
  /** Which hint: the VAT-change variant when the rate differs from today's during the term. */
  const hintKey = (step: ExplainStep) =>
    (step.id === 'total_cost' && steps.some((s) => s.id === 'vat_change')) ||
    (step.id === 'buyout' && step.params.buyoutVatPercent !== todayRate)
      ? `explain.${step.id}.hintVatChange`
      : `explain.${step.id}.hint`;

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
      case 'vat_change':
        return {
          date: formatIsoDate(String(p.fromDate), locale),
          rate: num(p.ratePercent),
          count: Number(p.invoiceCount),
          gross: eur(Number(p.monthlyGrossCents)),
        };
      case 'total_cost':
        return { term: Number(p.termMonths) };
      case 'buyout':
        return {
          percent: num(p.buyoutPercent),
          gross: eur(Number(p.buyoutGrossCents)),
          rate: num(p.buyoutVatPercent),
        };
      default:
        return {};
    }
  }

  return (
    <section
      aria-labelledby="explain-title"
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="explain-title" className="text-xl font-semibold">
            {t('explain.title')}
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('explain.intro')}</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-stone-300 px-4 text-sm font-medium hover:border-stone-500 dark:border-stone-700"
        >
          {open ? t('explain.hideDetails') : t('explain.showDetails')}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </div>
      <ol id={listId} className="mt-4 flex flex-col">
        {steps.map((step, i) => {
          const v = values(step);
          const amount = step.amountCents ?? 0;
          return (
            <li
              key={`${step.id}${step.params.fromDate ?? ''}`}
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
                <span className="font-medium">{say(`explain.${step.id}.label`, v)}</span>
                {open ? (
                  <span className="text-sm text-stone-600 dark:text-stone-400">
                    {say(hintKey(step), v)}
                  </span>
                ) : null}
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
                    : step.id === 'vat' || (step.id === 'vat_change' && amount >= 0)
                      ? `+ ${eur(amount)}`
                      : step.id === 'vat_change'
                        ? `− ${eur(-amount)}`
                        : eur(amount)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
