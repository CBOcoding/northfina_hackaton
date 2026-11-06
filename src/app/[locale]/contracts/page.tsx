// All signed contracts, newest first, each linking to its page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { loadCustomers } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listContracts } from '@/server/contracts';
import { db } from '@/server/db';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/contracts'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: `${t('contracts.title')} · ${t('brand.name')}` };
}

export default async function ContractsPage({ params }: PageProps<'/[locale]/contracts'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const [contracts, customers] = await Promise.all([listContracts(db), loadCustomers()]);
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('contracts.title')}</h1>
      {contracts.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-stone-300 p-6 text-stone-700 dark:border-stone-700 dark:text-stone-300">
          {t('contracts.empty')}
        </p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {contracts.map((c) => (
            <li key={c.number}>
              <Link
                href={`/${locale}/contracts/${c.number}`}
                className="flex flex-col gap-1 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
              >
                <span className="font-mono text-sm text-stone-600 dark:text-stone-400">
                  {c.number}
                </span>
                <span className="text-lg font-semibold">{nameOf(c.customerId)}</span>
                <span className="text-sm text-stone-700 dark:text-stone-300">
                  {t('contracts.summary', {
                    assets: c.items
                      .map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.assetId}` : i.assetId))
                      .join(', '),
                    term: c.termMonths,
                    rent: formatEuro(c.monthlyNetCents, intlLocale[locale]),
                    date: formatIsoDate(c.signedOn, locale),
                  })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
