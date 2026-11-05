'use client';

// Time travel: move a slider through the contract month by month. The current invoice, the
// running totals and the full invoice list follow; when VAT changed since the start, a note
// explains why the invoice is higher although the rent is locked.
import { useId, useState } from 'react';
import { formatEuro } from '@/domain/money';
import { replayAt } from '@/domain/replay';
import type { InvoiceLine } from '@/domain/types';
import { getT } from '@/i18n/get-t';
import { formatNumber } from '@/i18n/format';
import { intlLocale, type Locale } from '@/i18n/locales';
import { EarlyExitPanel, type ExitContext } from './early-exit-panel';
import { InvoiceTable } from './invoice-table';

type Props = {
  locale: Locale;
  invoices: InvoiceLine[];
  startDate: string;
  initialMonth: number;
  exit?: ExitContext;
};

export function TimeTravel({ locale, invoices, startDate, initialMonth, exit }: Props) {
  const t = getT(locale);
  const sliderId = useId();
  const [month, setMonth] = useState(initialMonth);
  const replay = replayAt(invoices, month);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`)
    );
  const pct = (bp: number) => formatNumber(bp / 100, locale);
  const startDay = Number(startDate.slice(8, 10));
  const totals = invoices.reduce(
    (s, i) => ({ net: s.net + i.netCents, vat: s.vat + i.vatCents, gross: s.gross + i.grossCents }),
    { net: 0, vat: 0, gross: 0 }
  );
  const first = invoices[0];
  const addsUp =
    first !== undefined &&
    totals.net === first.netCents * invoices.length &&
    totals.gross === totals.net + totals.vat;
  const step = (delta: number) =>
    setMonth(Math.min(Math.max(replay.month + delta, 1), invoices.length));

  return (
    <section
      aria-labelledby="tt-title"
      className="mt-8 flex flex-col gap-5 rounded-2xl border-2 border-emerald-700 bg-white p-6 dark:bg-stone-900"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tt-title" className="text-xl font-semibold">
          {t('timeTravel.title')}
        </h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">{t('timeTravel.intro')}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={t('timeTravel.previous')}
          className="size-11 shrink-0 rounded-lg border border-stone-300 text-lg font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          ‹
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={sliderId} className="font-semibold">
            {t('timeTravel.month', {
              month: replay.month,
              term: invoices.length,
              date: date(replay.current.dueDate),
            })}
          </label>
          <input
            id={sliderId}
            type="range"
            min={1}
            max={invoices.length}
            value={replay.month}
            aria-valuetext={t('timeTravel.month', {
              month: replay.month,
              term: invoices.length,
              date: date(replay.current.dueDate),
            })}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="h-8 w-full accent-emerald-700"
          />
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={t('timeTravel.next')}
          className="size-11 shrink-0 rounded-lg border border-stone-300 text-lg font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          ›
        </button>
      </div>

      <div aria-live="polite" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-stone-100 p-4 dark:bg-stone-800">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t('timeTravel.invoice', {
              number: replay.current.number,
              date: date(replay.current.dueDate),
            })}
          </p>
          <p className="font-mono text-3xl tabular-nums">{eur(replay.current.grossCents)}</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t('quote.monthlyBreakdown', {
              net: eur(replay.current.netCents),
              vat: eur(replay.current.vatCents),
              rate: pct(replay.current.vatRateBp),
              term: invoices.length,
            })}
          </p>
        </div>
        <div className="rounded-xl bg-stone-100 p-4 dark:bg-stone-800">
          <p className="text-sm text-stone-600 dark:text-stone-300">{t('timeTravel.invoiced')}</p>
          <p className="font-mono text-3xl tabular-nums">{eur(replay.invoicedGrossCents)}</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t('timeTravel.invoicedCount', { count: replay.month })}
          </p>
        </div>
        <div className="rounded-xl bg-stone-100 p-4 dark:bg-stone-800">
          <p className="text-sm text-stone-600 dark:text-stone-300">{t('timeTravel.remaining')}</p>
          <p className="font-mono text-3xl tabular-nums">{eur(replay.remainingGrossCents)}</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t('timeTravel.remainingCount', { count: replay.remainingCount })}
          </p>
        </div>
      </div>

      {replay.vatChange ? (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
        >
          <strong>{t('timeTravel.vatWhy')}</strong>{' '}
          {t('timeTravel.vatExplain', {
            net: eur(replay.vatChange.netCents),
            from: pct(replay.vatChange.fromRateBp),
            to: pct(replay.vatChange.toRateBp),
            since: date(replay.vatChange.since),
            difference: eur(Math.abs(replay.vatChange.grossDifferenceCents)),
          })}
        </p>
      ) : null}

      {startDay > 28 ? (
        <p className="rounded-xl bg-sky-50 p-4 text-sky-950 dark:bg-sky-950 dark:text-sky-100">
          {t('timeTravel.monthEnd', { day: startDay })}
        </p>
      ) : null}

      {exit ? (
        <EarlyExitPanel
          locale={locale}
          context={exit}
          monthsPaid={replay.month}
          vatRateBp={replay.current.vatRateBp}
        />
      ) : null}

      <InvoiceTable locale={locale} invoices={invoices} currentMonth={replay.month} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-stone-100 p-3 dark:bg-stone-800">
          <dt className="text-sm text-stone-600 dark:text-stone-300">{t('timeTravel.totalNet')}</dt>
          <dd className="font-mono tabular-nums">{eur(totals.net)}</dd>
        </div>
        <div className="rounded-xl bg-stone-100 p-3 dark:bg-stone-800">
          <dt className="text-sm text-stone-600 dark:text-stone-300">{t('timeTravel.totalVat')}</dt>
          <dd className="font-mono tabular-nums">{eur(totals.vat)}</dd>
        </div>
        <div className="rounded-xl bg-stone-100 p-3 dark:bg-stone-800">
          <dt className="text-sm text-stone-600 dark:text-stone-300">
            {t('timeTravel.totalGross')}
          </dt>
          <dd className="font-mono tabular-nums">{eur(totals.gross)}</dd>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
          <dt className="text-sm">{t('timeTravel.addsUp')}</dt>
          <dd className="font-semibold">
            {addsUp && first
              ? t('timeTravel.addsUpYes', {
                  count: invoices.length,
                  rent: eur(first.netCents),
                  total: eur(totals.net),
                })
              : t('timeTravel.addsUpNo')}
          </dd>
        </div>
      </dl>
    </section>
  );
}
