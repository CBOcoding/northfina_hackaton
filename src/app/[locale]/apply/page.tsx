// The application page: pick a person, an item and a term, answer the questions that apply.
// Deep links prefill it: ?customer=cust-mikko&asset=laptop-008&term=36&down=<cents>.
// Every item is unique (one serial number), so an application is for one unit.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ApplyForm, type ApplyAsset } from '@/components/apply/apply-form';
import { TERMS } from '@/components/apply/helpers';
import { loadCoefficientTable, loadCustomers, loadPriceLists, loadQuestions } from '@/data/load';
import { listPriceOn } from '@/domain/price-list';
import type { TermMonths } from '@/domain/types';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/apply'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: `${t('apply.title')} · ${t('brand.name')}` };
}

export default async function ApplyPage({ params, searchParams }: PageProps<'/[locale]/apply'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;

  // Prices depend on today's date and on the database: render on every request.
  await connection();

  const t = getT(locale);
  const today = todayIso();
  const [{ questions }, customers, priceLists, rows, table] = await Promise.all([
    loadQuestions(),
    loadCustomers(),
    loadPriceLists(),
    listAssets(db),
    loadCoefficientTable(),
  ]);

  const assets: ApplyAsset[] = rows.flatMap((a) => {
    const price = listPriceOn(priceLists, a.id, today);
    return price.ok
      ? [
          {
            id: a.id,
            label: `${a.make} ${a.model}`,
            category: a.category,
            status: a.status,
            priceCents: price.priceCents,
          },
        ]
      : [];
  });

  const term = Number(first(query.term));
  const down = Number(first(query.down)); // integer euro cents
  const initial = {
    customerId: customers.find((c) => c.id === first(query.customer))?.id ?? customers[0]?.id ?? '',
    assetId: assets.find((a) => a.id === first(query.asset))?.id ?? assets[0]?.id ?? '',
    term: (TERMS.includes(term as TermMonths) ? term : 36) as TermMonths,
    downCents: Number.isSafeInteger(down) && down >= 0 ? down : 0,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('apply.title')}</h1>
      <p className="mt-3 mb-8 text-lg text-stone-700 dark:text-stone-300">{t('apply.intro')}</p>
      {customers.length === 0 || assets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('apply.empty')}
        </p>
      ) : (
        <ApplyForm
          locale={locale}
          questions={questions}
          customers={customers}
          assets={assets}
          table={table}
          initial={initial}
        />
      )}
    </div>
  );
}
