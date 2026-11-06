// The quote page: one item, its price today, and the live calculator.
// The server decides what "today" is and loads the data; the calculator runs the same pure
// domain functions in the browser, so the sliders update without a round trip.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { QuoteCalculator } from '@/components/quote/quote-calculator';
import { loadCoefficientTable, loadPriceLists, loadVatRates } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { vatRateOn } from '@/domain/vat';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/quote/[assetId]'>): Promise<Metadata> {
  const { assetId } = await params;
  const asset = (await listAssets(db)).find((a) => a.id === assetId);
  return asset ? { title: `${asset.make} ${asset.model} · Lease Loop` } : {};
}

export default async function QuotePage({ params }: PageProps<'/[locale]/quote/[assetId]'>) {
  const { locale, assetId } = await params;
  if (!isLocale(locale)) notFound();
  await connection();

  const t = getT(locale);
  const today = todayIso();
  const [assets, priceLists, table, vatRates] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    loadCoefficientTable(),
    loadVatRates(),
  ]);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) notFound();

  const price = listPriceOn(priceLists, asset.id, today);
  const vat = vatRateOn(vatRates, today);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${locale}`}
        className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
      >
        ← {t('quote.backToCatalogue')}
      </Link>

      <div className="mt-4">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {asset.make} · <span className="font-mono">{asset.id}</span>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{asset.model}</h1>
        {price.ok ? (
          <p className="mt-2 text-stone-700 dark:text-stone-300">
            {t('quote.listPrice', {
              price: formatEuro(price.priceCents, intlLocale[locale]),
              version: price.priceListVersion,
            })}
          </p>
        ) : null}
      </div>

      {asset.status !== 'available' ? (
        <p
          role="status"
          className="mt-8 rounded-xl bg-amber-50 p-5 text-amber-950 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
        >
          {t(`quote.notLeasable.${asset.status}`)}
        </p>
      ) : !price.ok || !vat.ok ? (
        <p
          role="status"
          className="mt-8 rounded-xl bg-amber-50 p-5 text-amber-950 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
        >
          {t('quote.noPrice')}
        </p>
      ) : (
        <QuoteCalculator
          locale={locale}
          assetId={asset.id}
          listPriceCents={price.priceCents}
          vatRates={vatRates}
          quoteDate={today}
          table={table}
        />
      )}
    </div>
  );
}
