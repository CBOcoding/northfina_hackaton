// One catalogue item. A server component: it renders to HTML and ships no JavaScript.
import type { Asset, AssetStatus } from '@/data/schemas';
import { formatEuro } from '@/domain/money';
import type { ListPriceResult } from '@/domain/price-list';
import { formatNumber } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

const statusStyles: Record<AssetStatus, { badge: string; dot: string }> = {
  available: {
    badge:
      'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800',
    dot: 'bg-emerald-600 dark:bg-emerald-400',
  },
  reserved: {
    badge:
      'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
  returned: {
    badge:
      'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800',
    dot: 'bg-sky-600 dark:bg-sky-400',
  },
};

type AssetCardProps = {
  asset: Asset;
  price: ListPriceResult;
  locale: Locale;
  t: Translate;
};

export function AssetCard({ asset, price, locale, t }: AssetCardProps) {
  const headingId = `asset-${asset.id}`;
  const status = statusStyles[asset.status];

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-stone-600 dark:text-stone-400">{asset.make}</p>
          <h3 id={headingId} className="text-lg leading-snug font-semibold">
            {asset.model}
          </h3>
        </div>
        <p
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.badge}`}
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
          <span className="sr-only">{t('status.label')}: </span>
          {t(`status.${asset.status}`)}
        </p>
      </div>

      <dl className="mt-4 mb-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Fact label={t('condition.label')} value={t(`condition.${asset.condition}`)} />
        <Fact label={t('asset.modelYear')} value={String(asset.model_year)} />
        <Fact
          label={t('asset.usage')}
          value={t(`usage.${asset.usage.unit}`, { value: formatNumber(asset.usage.value, locale) })}
        />
        <Fact label={t('asset.previousLives')} value={formatNumber(asset.previous_lives, locale)} />
      </dl>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
        <div className="text-xs text-stone-600 dark:text-stone-400">
          <p>{t('asset.listPrice')}</p>
          {price.ok ? (
            <p>{t('asset.priceListVersion', { version: price.priceListVersion })}</p>
          ) : null}
        </div>
        <p className="text-right text-xl font-semibold tabular-nums">
          {price.ok ? formatEuro(price.priceCents, intlLocale[locale]) : t('asset.noPrice')}
        </p>
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-600 dark:text-stone-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
