'use client';

// Live quote: term and down payment sliders, the monthly price, "Explain my price" and the
// 24 vs 36 months comparison. All numbers come from the pure functions in src/domain.
import Link from 'next/link';
import { useId, useState } from 'react';
import type { CoefficientTable, VatRates } from '@/data/schemas';
import { compareTerms, explainPrice, withVatSchedule } from '@/domain/explain';
import {
  bandHint,
  clampDownPayment,
  downPaymentStepCents,
  maxDownPaymentCents,
  suggestedDownPayments,
} from '@/domain/down-payment';
import { formatEuro } from '@/domain/money';
import { quoteLease } from '@/domain/pricing';
import type { IsoDate } from '@/domain/types';
import { getT } from '@/i18n/get-t';
import { formatNumber } from '@/i18n/format';
import { intlLocale, type Locale } from '@/i18n/locales';
import { PriceExplanation } from './price-explanation';
import { TermComparison } from './term-comparison';

const TERMS = [12, 24, 36, 48] as const;

type Props = {
  locale: Locale;
  assetId: string;
  listPriceCents: number;
  vatRates: VatRates;
  /** The quote day: the lease is priced as if it started then, VAT on each due date. */
  quoteDate: IsoDate;
  table: CoefficientTable;
};

export function QuoteCalculator({
  locale,
  assetId,
  listPriceCents,
  vatRates,
  quoteDate,
  table,
}: Props) {
  const t = getT(locale);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  // Round amounts on the suggestion buttons, without cents, so five fit on one line.
  const wholeEur = (cents: number) =>
    new Intl.NumberFormat(intlLocale[locale], {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  const termId = useId();
  const downId = useId();
  const [termIndex, setTermIndex] = useState(2); // 36 months
  const typedId = useId();
  const [requestedDownCents, setRequestedDownCents] = useState(0);

  const termMonths = TERMS[termIndex] ?? 36;
  // Down payment in whole euros, moved in steps that grow with the price (see down-payment.ts).
  const downStepCents = downPaymentStepCents(listPriceCents);
  const downMaxCents = maxDownPaymentCents(table, listPriceCents);
  const downPaymentCents = clampDownPayment(table, listPriceCents, requestedDownCents);
  const suggestions = suggestedDownPayments(table, listPriceCents);
  const hint = bandHint(table, listPriceCents, downPaymentCents);
  const downShare = new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 1 }).format(
    listPriceCents > 0 ? (downPaymentCents * 100) / listPriceCents : 0
  );
  const downValue = t('quote.downPaymentValue', {
    amount: eur(downPaymentCents),
    percent: downShare,
  });
  const result = quoteLease(table, { listPriceCents, downPaymentCents, termMonths });
  const priced = result.ok ? withVatSchedule(result.quote, vatRates, quoteDate) : null;
  const band = result.ok ? table.bands.find((b) => b.band === result.quote.band) : undefined;
  const comparison = compareTerms(table, {
    listPriceCents,
    downPaymentCents,
    terms: TERMS,
    vatRates,
    startDate: quoteDate,
  });
  const ratePercent = formatNumber((priced?.vatRateBp ?? 0) / 100, locale);

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
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
            {!result.ok ? t(`quote.refusal.${result.reason}`) : t('quote.noPrice')}
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

        <div className="flex flex-col gap-3">
          <div className="flex justify-between gap-3">
            <label htmlFor={downId} className="font-semibold">
              {t('quote.downPayment')}
            </label>
            <span className="font-mono tabular-nums">{downValue}</span>
          </div>
          {suggestions.length > 1 ? (
            <div
              role="group"
              aria-label={t('quote.downSuggestions')}
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${suggestions.length}, minmax(0, 1fr))` }}
            >
              {suggestions.map((cents) => {
                const selected = cents === downPaymentCents;
                return (
                  <button
                    key={cents}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRequestedDownCents(cents)}
                    className={`min-h-10 rounded-full border px-1 text-sm font-semibold whitespace-nowrap ${
                      selected
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
                        : 'border-stone-300 bg-white hover:border-stone-500 dark:border-stone-700 dark:bg-stone-900'
                    }`}
                  >
                    {cents === 0 ? t('quote.downNone') : wholeEur(cents)}
                  </button>
                );
              })}
            </div>
          ) : null}
          <input
            id={downId}
            type="range"
            min={0}
            max={downMaxCents}
            step={downStepCents}
            value={downPaymentCents}
            disabled={downMaxCents === 0}
            aria-valuetext={downValue}
            onChange={(e) => setRequestedDownCents(Number(e.target.value))}
            className="h-8 w-full accent-emerald-700"
          />
          <div
            aria-hidden="true"
            className="flex justify-between gap-2 text-xs text-stone-600 dark:text-stone-400"
          >
            <span>{eur(0)}</span>
            <span>{t('quote.downStep', { step: eur(downStepCents) })}</span>
            <span>{t('quote.downMax', { max: eur(downMaxCents) })}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={typedId} className="text-sm text-stone-600 dark:text-stone-300">
              {t('quote.downTyped')}
            </label>
            <input
              id={typedId}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              autoComplete="off"
              value={downPaymentCents === 0 ? '' : String(downPaymentCents / 100)}
              disabled={downMaxCents === 0}
              onChange={(e) =>
                setRequestedDownCents(Number(e.target.value.replace(/\D/g, '').slice(0, 7)) * 100)
              }
              className="min-h-11 w-32 rounded-lg border border-stone-300 bg-white px-3 font-mono tabular-nums dark:border-stone-700 dark:bg-stone-900"
            />
          </div>
          {hint ? (
            <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-200">
              {hint.kind === 'moved'
                ? t('quote.bandHint.moved', {
                    band: hint.band,
                    rate: formatNumber(hint.annualInterestPercent, locale),
                    originalBand: hint.originalBand,
                    originalRate: formatNumber(hint.originalInterestPercent, locale),
                    amount: eur(hint.keepUpToCents),
                  })
                : t('quote.bandHint.crosses', {
                    amount: eur(hint.fromCents),
                    band: hint.band,
                    rate: formatNumber(hint.annualInterestPercent, locale),
                    currentRate: formatNumber(hint.currentInterestPercent, locale),
                  })}
            </p>
          ) : null}
        </div>

        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
          {t('quote.lockNote')}
        </p>

        {priced ? (
          <Link
            href={`/${locale}/apply?asset=${assetId}&qty=1&term=${termMonths}&down=${downPaymentCents}`}
            className="flex min-h-12 items-center justify-center rounded-full bg-emerald-700 px-6 font-semibold text-white hover:bg-emerald-800"
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
        <TermComparison locale={locale} comparison={comparison} selectedTerm={termMonths} />
      </div>
    </div>
  );
}
