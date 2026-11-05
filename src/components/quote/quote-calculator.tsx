'use client';

// Live quote: term and down payment sliders, the monthly price, "Explain my price" and the
// 24 vs 36 months comparison. All numbers come from the pure functions in src/domain.
import Link from 'next/link';
import { useId, useState } from 'react';
import type { CoefficientTable } from '@/data/schemas';
import { compareTerms, explainPrice, withVat } from '@/domain/explain';
import { formatEuro, roundHalfUp } from '@/domain/money';
import { quoteLease } from '@/domain/pricing';
import { getT } from '@/i18n/get-t';
import { formatNumber } from '@/i18n/format';
import { intlLocale, type Locale } from '@/i18n/locales';
import { PriceExplanation } from './price-explanation';
import { TermComparison } from './term-comparison';

const TERMS = [12, 24, 36, 48] as const;
const MAX_DOWN_PERCENT = 50;

type Props = {
  locale: Locale;
  assetId: string;
  listPriceCents: number;
  vatRateBp: number;
  table: CoefficientTable;
};

export function QuoteCalculator({ locale, assetId, listPriceCents, vatRateBp, table }: Props) {
  const t = getT(locale);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const termId = useId();
  const downId = useId();
  const [termIndex, setTermIndex] = useState(2); // 36 months
  const [downPercent, setDownPercent] = useState(0);

  const termMonths = TERMS[termIndex] ?? 36;
  // Down payment in whole cents: list price × percent, rounded once, half up.
  const downPaymentCents = roundHalfUp(listPriceCents * downPercent, 100);
  const result = quoteLease(table, { listPriceCents, downPaymentCents, termMonths });
  const priced = result.ok ? withVat(result.quote, vatRateBp) : null;
  const band = result.ok ? table.bands.find((b) => b.band === result.quote.band) : undefined;
  const comparison = compareTerms(table, {
    listPriceCents,
    downPaymentCents,
    terms: [24, 36],
    vatRateBp,
  });
  const ratePercent = formatNumber(vatRateBp / 100, locale);

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
      <section
        aria-labelledby="quote-title"
        className="flex flex-col gap-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
      >
        <h2 id="quote-title" className="sr-only">
          {t('quote.title')}
        </h2>

        {priced ? (
          <div className="rounded-xl bg-stone-100 p-5 dark:bg-stone-800">
            <p className="text-sm font-medium text-stone-600 dark:text-stone-300">
              {t('quote.youPay')}
            </p>
            <p
              aria-live="polite"
              className="font-mono text-5xl font-medium tracking-tight tabular-nums"
            >
              {eur(priced.monthlyGrossCents)}
            </p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
              {t('quote.monthlyBreakdown', {
                net: eur(priced.quote.monthlyNetCents),
                vat: eur(priced.monthlyVatCents),
                rate: ratePercent,
                term: termMonths,
              })}
            </p>
          </div>
        ) : (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 p-5 text-amber-950 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
          >
            {!result.ok ? t(`quote.refusal.${result.reason}`) : null}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex justify-between gap-3">
            <label htmlFor={termId} className="font-semibold">
              {t('quote.term')}
            </label>
            <span className="font-mono tabular-nums">
              {t('quote.termValue', { term: termMonths })}
            </span>
          </div>
          <input
            id={termId}
            type="range"
            min={0}
            max={TERMS.length - 1}
            step={1}
            value={termIndex}
            aria-valuetext={t('quote.termValue', { term: termMonths })}
            onChange={(e) => setTermIndex(Number(e.target.value))}
            className="h-8 w-full accent-emerald-700"
          />
          <div
            aria-hidden="true"
            className="flex justify-between text-xs text-stone-600 dark:text-stone-400"
          >
            {TERMS.map((term) => (
              <span key={term}>{term}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between gap-3">
            <label htmlFor={downId} className="font-semibold">
              {t('quote.downPayment')}
            </label>
            <span className="font-mono tabular-nums">
              {t('quote.downPaymentValue', { amount: eur(downPaymentCents), percent: downPercent })}
            </span>
          </div>
          <input
            id={downId}
            type="range"
            min={0}
            max={MAX_DOWN_PERCENT}
            step={5}
            value={downPercent}
            aria-valuetext={t('quote.downPaymentValue', {
              amount: eur(downPaymentCents),
              percent: downPercent,
            })}
            onChange={(e) => setDownPercent(Number(e.target.value))}
            className="h-8 w-full accent-emerald-700"
          />
          <div
            aria-hidden="true"
            className="flex justify-between text-xs text-stone-600 dark:text-stone-400"
          >
            <span>0 %</span>
            <span>{MAX_DOWN_PERCENT} %</span>
          </div>
        </div>

        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
          {t('quote.lockNote')}
        </p>

        {priced ? (
          <Link
            href={`/${locale}/apply?asset=${assetId}&qty=1&term=${termMonths}&down=${downPaymentCents}`}
            className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-700 px-6 font-semibold text-white hover:bg-emerald-800"
          >
            {t('quote.apply')}
          </Link>
        ) : null}
      </section>

      {priced && band ? (
        <PriceExplanation
          locale={locale}
          steps={explainPrice(priced, {
            minCents: band.min_financed_cents,
            maxCents: band.max_financed_cents,
          })}
        />
      ) : null}

      <div className="lg:col-span-2">
        <TermComparison locale={locale} comparison={comparison} />
      </div>
    </div>
  );
}
