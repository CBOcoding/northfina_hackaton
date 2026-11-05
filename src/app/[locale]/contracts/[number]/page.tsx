// One contract: the locked terms, why that price was locked, and the time-travel replay of
// its invoices. The server picks "today" so the replay opens on the current month.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ContractTerms } from '@/components/contract/contract-terms';
import { TimeTravel } from '@/components/contract/time-travel';
import {
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadResidualCurves,
} from '@/data/load';
import { decideLockedPrice, type SigningItem } from '@/domain/contract';
import { listPriceOn } from '@/domain/price-list';
import { monthOn } from '@/domain/replay';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export default async function ContractPage({ params }: PageProps<'/[locale]/contracts/[number]'>) {
  const { locale, number } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);

  const stored = await getContract(db, number);
  if (!stored) notFound();
  const { contract, invoices } = stored;
  const [customers, priceLists, table, curves, assets, application] = await Promise.all([
    loadCustomers(),
    loadPriceLists(),
    loadCoefficientTable(),
    loadResidualCurves(),
    listAssets(db),
    db.contract.findUnique({
      where: { number },
      select: { application: { select: { quoted_on: true } } },
    }),
  ]);
  const customer = customers.find((c) => c.id === contract.customerId);

  // Rebuild the price-lock decision from the stored dates, to show both prices side by side.
  const quotedOn = application?.application.quoted_on ?? contract.signedOn;
  const items: SigningItem[] = [];
  for (const item of contract.items) {
    const quoted = listPriceOn(priceLists, item.assetId, quotedOn);
    const signing = listPriceOn(priceLists, item.assetId, contract.signedOn);
    if (quoted.ok && signing.ok) {
      items.push({
        assetId: item.assetId,
        lifeNumber: item.lifeNumber,
        quantity: item.quantity,
        quotedPriceCents: quoted.priceCents,
        quotedPriceListVersion: quoted.priceListVersion,
        signingPriceCents: signing.priceCents,
        signingPriceListVersion: signing.priceListVersion,
      });
    }
  }
  const lock =
    items.length === contract.items.length
      ? decideLockedPrice(quotedOn, contract.signedOn, items)
      : null;

  // Early exit needs the band's interest rate and each item's category for its market value.
  const band = table.bands.find((b) => b.band === contract.band);
  const exitItems = contract.items.flatMap((item) => {
    const asset = assets.find((a) => a.id === item.assetId);
    return asset
      ? [{ category: asset.category, listPriceCents: item.listPriceCents, quantity: item.quantity }]
      : [];
  });
  const exit =
    band && exitItems.length === contract.items.length
      ? {
          monthlyNetCents: contract.monthlyNetCents,
          termMonths: contract.termMonths,
          buyoutNetCents: contract.buyoutNetCents,
          annualInterestPercent: band.annual_interest_percent,
          items: exitItems,
          curves,
        }
      : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${locale}/contracts`}
        className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
      >
        ← {t('contracts.back')}
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-stone-600 dark:text-stone-400">{contract.number}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {customer?.name ?? contract.customerId}
          </h1>
          <p className="mt-1 text-stone-700 dark:text-stone-300">
            {t('contract.subtitle', {
              assets: contract.items
                .map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.assetId}` : i.assetId))
                .join(', '),
              term: contract.termMonths,
            })}
          </p>
        </div>
        <p className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200 ring-inset dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
          {t('contract.locked')}
        </p>
      </div>

      <ContractTerms locale={locale} contract={contract} lock={lock} quotedOn={quotedOn} />
      <TimeTravel
        locale={locale}
        invoices={invoices}
        startDate={contract.startDate}
        initialMonth={monthOn(invoices, todayIso())}
        exit={exit}
      />
    </div>
  );
}
