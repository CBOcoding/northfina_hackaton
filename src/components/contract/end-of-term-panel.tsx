'use client';

// End of term: buy, give back or pass on. For return and pass on the customer reports the
// condition and usage of each item. The server computes the end date and the buyout invoice.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { AssetCondition, UsageUnit } from '@/data/schemas';
import type { EndChoice } from '@/domain/end-of-term';
import { formatEuro } from '@/domain/money';
import { CONDITION_ORDER } from '@/domain/refurbishment';
import type { ContractStatus, InvoiceLine } from '@/domain/types';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type EndItem = {
  assetId: string;
  name: string;
  condition: AssetCondition;
  usageUnit: UsageUnit;
  usageValue: number;
};

type Props = {
  locale: Locale;
  number: string;
  status: ContractStatus;
  endDate: string;
  endedOn: string | null;
  buyout: { netCents: number; grossCents: number } | null;
  /** The buyout invoice once the item is bought (it is not in the time-travel list). */
  buyoutInvoice: InvoiceLine | null;
  items: EndItem[];
};

const CHOICES: EndChoice[] = ['buy', 'return', 'pass_on'];

export function EndOfTermPanel(props: Props) {
  const { locale, number, status, endDate, endedOn, buyout, buyoutInvoice, items } = props;
  const t = getT(locale);
  const router = useRouter();
  const groupId = useId();
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const [choice, setChoice] = useState<EndChoice>('buy');
  const [reports, setReports] = useState(() =>
    Object.fromEntries(
      items.map((i) => [i.assetId, { condition: i.condition, usageValue: i.usageValue }])
    )
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The button is disabled while saving, so focus would be lost: take it to the error.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  if (status !== 'active') {
    return (
      <section aria-labelledby={`${groupId}-title`} className="mt-10">
        <h2 id={`${groupId}-title`} className="text-2xl font-semibold">
          {t('endOfTerm.title')}
        </h2>
        <p className="mt-3 text-lg">
          {t(`endOfTerm.ended.${status as Exclude<ContractStatus, 'active'>}`, {
            date: endedOn ? formatIsoDate(endedOn, locale) : '',
          })}
        </p>
        {status === 'bought' && buyoutInvoice ? (
          <p className="mt-2">
            {t('endOfTerm.buyoutInvoice', {
              number: buyoutInvoice.number,
              gross: eur(buyoutInvoice.grossCents),
              date: formatIsoDate(buyoutInvoice.dueDate, locale),
            })}
          </p>
        ) : null}
        {status === 'returned' || status === 'passed_on' ? (
          <ul className="mt-3 flex flex-wrap gap-3">
            {items.map((i) => (
              <li key={i.assetId}>
                <Link
                  href={`/${locale}/second-life/${i.assetId}`}
                  className="inline-flex min-h-11 items-center rounded-full bg-emerald-800 px-5 font-medium text-white hover:bg-emerald-900 dark:bg-emerald-300 dark:text-emerald-950"
                >
                  {t('endOfTerm.nextLife', { name: i.name })}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/contracts/${encodeURIComponent(number)}/end`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          choice,
          actor: 'customer',
          ...(choice === 'buy' ? {} : { reports }),
        }),
      });
      const body = (await response.json()) as
        { success: true } | { success: false; error: { code: string } };
      if (body.success) {
        router.refresh();
        return;
      }
      setError(t('endOfTerm.failed', { code: body.error.code }));
    } catch {
      setError(t('endOfTerm.failed', { code: 'NETWORK' }));
    }
    setBusy(false);
  }

  const field =
    'min-h-11 rounded-lg border border-stone-300 px-3 dark:border-stone-600 dark:bg-stone-950';

  return (
    <section aria-labelledby={`${groupId}-title`} className="mt-10">
      <h2 id={`${groupId}-title`} className="text-2xl font-semibold">
        {t('endOfTerm.title')}
      </h2>
      <p className="mt-2 text-lg">
        {t('endOfTerm.intro', { date: formatIsoDate(endDate, locale) })}
      </p>
      <form
        onSubmit={submit}
        className="mt-4 flex flex-col gap-5 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-semibold">{t('endOfTerm.choice')}</legend>
          {CHOICES.map((c) => (
            <label key={c} className="flex items-start gap-3">
              <input
                type="radio"
                name={`${groupId}-choice`}
                value={c}
                checked={choice === c}
                onChange={() => setChoice(c)}
                className="mt-1 size-5 accent-emerald-700"
              />
              <span>
                <span className="block font-medium">
                  {c === 'buy' && buyout
                    ? t('endOfTerm.buy', { gross: eur(buyout.grossCents) })
                    : t(`endOfTerm.${c}`)}
                </span>
                <span className="block text-sm text-stone-700 dark:text-stone-300">
                  {c === 'buy' && buyout
                    ? t('endOfTerm.buyHint', {
                        net: eur(buyout.netCents),
                        date: formatIsoDate(endDate, locale),
                      })
                    : t(`endOfTerm.${c}Hint`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {choice !== 'buy'
          ? items.map((item) => {
              const report = reports[item.assetId] ?? item;
              const unit = t(`usage.${item.usageUnit}`, { value: '' }).trim();
              const set = (patch: Partial<typeof report>) =>
                setReports((r) => ({ ...r, [item.assetId]: { ...report, ...patch } }));
              return (
                <fieldset key={item.assetId} className="flex flex-col gap-3">
                  <legend className="mb-2 font-semibold">
                    {t('endOfTerm.report', { name: item.name })}
                  </legend>
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">{t('condition.label')}</span>
                    <select
                      value={report.condition}
                      onChange={(e) => set({ condition: e.target.value as AssetCondition })}
                      className={field}
                    >
                      {[...CONDITION_ORDER].reverse().map((c) => (
                        <option key={c} value={c}>
                          {t(`condition.${c}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-medium">{t('endOfTerm.usage', { unit })}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      required
                      value={String(report.usageValue)}
                      onChange={(e) =>
                        set({ usageValue: Number(e.target.value.replace(/\D/g, '').slice(0, 7)) })
                      }
                      className={field}
                    />
                    <span className="text-sm text-stone-600 dark:text-stone-400">
                      {t('endOfTerm.usageMin', { value: item.usageValue })}
                    </span>
                  </label>
                </fieldset>
              );
            })
          : null}

        <p className="text-sm text-stone-600 dark:text-stone-400">{t('endOfTerm.demo')}</p>
        {error ? (
          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-red-900 dark:bg-red-950 dark:text-red-100"
          >
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-full bg-emerald-700 px-6 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('endOfTerm.busy') : t('endOfTerm.confirm')}
        </button>
      </form>
    </section>
  );
}
