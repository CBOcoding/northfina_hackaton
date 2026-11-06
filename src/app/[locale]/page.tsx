// The catalogue: every asset, grouped by category, with today's net list price.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { CategoryIcon } from '@/components/category-icon';
import { AssetCard } from '@/components/asset-card';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import { assetCategorySchema } from '@/data/schemas';
import { leaseOffer } from '@/domain/catalogue';
import { listPriceOn } from '@/domain/price-list';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: `${t('catalogue.title')} · ${t('brand.name')}` };
}

export default async function CataloguePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Render on every request: prices depend on today's date and on the database.
  await connection();

  const t = getT(locale);
  const today = todayIso(); // the page decides what "today" is; domain code never reads the clock
  const [assets, priceLists, table] = await Promise.all([
    listAssets(db),
    loadPriceLists(),
    loadCoefficientTable(),
  ]);
  const groups = assetCategorySchema.options
    .map((category) => ({ category, assets: assets.filter((a) => a.category === category) }))
    .filter((group) => group.assets.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rounded-3xl bg-linear-to-br from-emerald-400 via-emerald-500 to-emerald-800 px-6 pt-10 pb-16 text-white shadow-[0_10px_22px_-12px_rgb(0_0_0/0.43)] sm:px-10 sm:pt-14 sm:pb-20">
        <h1 className="max-w-2xl text-3xl font-medium tracking-tight sm:text-5xl">
          {t('catalogue.title')}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/90">{t('catalogue.intro')}</p>
        <p className="mt-6 inline-flex rounded-full bg-white px-4 py-1.5 text-sm font-medium text-stone-900">
          <time dateTime={today}>
            {t('catalogue.pricesOn', { date: formatIsoDate(today, locale) })}
          </time>
        </p>
      </div>

      {groups.length > 0 ? (
        <nav
          aria-label={t('catalogue.jumpTo')}
          className="-mt-8 mx-4 rounded-3xl bg-linear-to-b from-emerald-100 to-white px-4 py-6 shadow-[0_8px_22px_rgb(35_31_32/0.08)] ring-1 ring-stone-200 sm:mx-10 dark:from-emerald-950 dark:to-stone-900 dark:ring-stone-800"
        >
          <p className="text-center text-sm font-medium">{t('catalogue.whatYouCanLease')}</p>
          <ul className="mt-4 flex flex-wrap justify-center gap-6 sm:gap-10">
            {groups.map((group) => (
              <li key={group.category}>
                <a
                  href={`#category-${group.category}`}
                  className="flex flex-col items-center gap-2 rounded-2xl p-1 text-sm font-medium hover:text-emerald-800 dark:hover:text-emerald-300"
                >
                  <CategoryIcon category={group.category} size="lg" />
                  {t(`category.${group.category}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {groups.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('catalogue.empty')}
        </p>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.category}
          aria-labelledby={`category-${group.category}`}
          className="mt-12"
        >
          <div className="flex items-center justify-between gap-4 border-b border-stone-200 pb-3 dark:border-stone-800">
            <h2
              id={`category-${group.category}`}
              className="flex scroll-mt-6 items-center gap-3 text-xl font-semibold"
            >
              <CategoryIcon category={group.category} />
              {t(`category.${group.category}`)}
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {t('catalogue.itemCount', { count: group.assets.length })}
            </p>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.assets.map((asset) => {
              const price = listPriceOn(priceLists, asset.id, today);
              return (
                <li key={asset.id}>
                  <AssetCard
                    asset={asset}
                    price={price}
                    offer={price.ok ? leaseOffer(price.priceCents, table) : null}
                    locale={locale}
                    t={t}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
