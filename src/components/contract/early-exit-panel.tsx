'use client';

// "Leave now?" (card 8): what ending the lease after the replayed month costs, to keep the
// item or to give it back. Our rule and its numbers come from src/domain/early-exit.ts.
import { useId, useState } from 'react';
import type { AssetCategory, AssetCondition, ResidualCurves } from '@/data/schemas';
import { earlyExit, earlyReturnCostCents } from '@/domain/early-exit';
import { marketValue } from '@/domain/market-value';
import { applyBasisPoints, formatEuro } from '@/domain/money';
import type { Cents } from '@/domain/types';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

export type ExitContext = {
  monthlyNetCents: Cents;
  termMonths: number;
  buyoutNetCents: Cents;
  annualInterestPercent: number;
  items: { category: AssetCategory; listPriceCents: Cents; quantity: number }[];
  curves: ResidualCurves;
};

const CONDITIONS: AssetCondition[] = ['like_new', 'good', 'fair', 'poor'];

type Props = { locale: Locale; context: ExitContext; monthsPaid: number; vatRateBp: number };

export function EarlyExitPanel({ locale, context, monthsPaid, vatRateBp }: Props) {
  const t = getT(locale);
  const selectId = useId();
  const [condition, setCondition] = useState<AssetCondition>('good');
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const withVat = (net: number) => net + applyBasisPoints(net, vatRateBp);

  const result = earlyExit({ ...context, monthsPaid });
  if (!result.ok) return null;
  const { exit } = result;
  const value = context.items.reduce(
    (sum, item) =>
      sum +
      item.quantity *
        marketValue(context.curves, {
          listPriceCents: item.listPriceCents,
          category: item.category,
          ageMonths: monthsPaid,
          condition,
          usageValue: 0,
        }).valueCents,
    0
  );
  const returnCost = earlyReturnCostCents(exit.payoffNetCents, value);

  return (
    <section
      aria-labelledby="exit-title"
      className="flex flex-col gap-4 rounded-xl border border-stone-200 p-5 dark:border-stone-700"
    >
      <div>
        <h3 id="exit-title" className="text-lg font-semibold">
          {t('earlyExit.title', { month: monthsPaid })}
        </h3>
        <p className="text-sm text-stone-600 dark:text-stone-400">{t('earlyExit.rule')}</p>
      </div>
      <div aria-live="polite" className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-stone-100 p-4 dark:bg-stone-800">
          <p className="font-semibold">{t('earlyExit.keep')}</p>
          <p className="font-mono text-2xl tabular-nums">{eur(withVat(exit.payoffNetCents))}</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t('earlyExit.keepDetail', {
              net: eur(exit.payoffNetCents),
              rents: exit.remainingRents,
              undiscounted: eur(exit.undiscountedNetCents),
              saved: eur(exit.interestSavedCents),
            })}
          </p>
        </div>
        <div className="rounded-xl bg-stone-100 p-4 dark:bg-stone-800">
          <p className="font-semibold">{t('earlyExit.return')}</p>
          <p className="font-mono text-2xl tabular-nums">{eur(withVat(returnCost))}</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {t('earlyExit.returnDetail', {
              owed: eur(exit.payoffNetCents),
              value: eur(value),
              net: eur(returnCost),
            })}
          </p>
          <label htmlFor={selectId} className="mt-2 block text-sm font-medium">
            {t('earlyExit.condition')}
          </label>
          <select
            id={selectId}
            value={condition}
            onChange={(e) => setCondition(e.target.value as AssetCondition)}
            className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 dark:border-stone-600 dark:bg-stone-900"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {t(`condition.${c}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
