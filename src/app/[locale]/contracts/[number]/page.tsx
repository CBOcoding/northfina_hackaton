// One contract: the locked terms, why that price was locked, and the time-travel replay of
// its invoices. The server picks "today" so the replay opens on the current month.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ContractTerms } from '@/components/contract/contract-terms';
import { EndOfTermPanel } from '@/components/contract/end-of-term-panel';
import { TimeTravel } from '@/components/contract/time-travel';
import {
  loadCoefficientTable,
  loadCustomers,
  loadPriceLists,
  loadResidualCurves,
  loadVatRates,
} from '@/data/load';
import { decideLockedPrice, type SigningItem } from '@/domain/contract';
import { endOfTerm, termEndDate } from '@/domain/end-of-term';
import { listPriceOn } from '@/domain/price-list';
import { monthOn } from '@/domain/replay';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { isLocale } from '@/i18n/locales';
import { listAssets } from '@/server/assets';
import { getContract } from '@/server/contracts';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/contracts/[number]'>): Promise<Metadata> {
  const { locale, number } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: `${t('contract.title', { number })} · ${t('brand.name')}` };
}

export default async function ContractPage({ params }: PageProps<'/[locale]/contracts/[number]'>) {
  const { locale, number } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);

  const stored = await getContract(db, number);
  if (!stored) notFound();
  const { contract, invoices } = stored;
  // The replay and its totals are about the rent; a buyout invoice is shown with the end of term.
  const rentInvoices = invoices.filter((i) => i.kind === 'rent');
  const buyoutInvoice = invoices.find((i) => i.kind === 'buyout') ?? null;
  const [customers, priceLists, table, curves, assets, application, vatRates] = await Promise.all([
    loadCustomers(),
    loadPriceLists(),
    loadCoefficientTable(),
    loadResidualCurves(),
    listAssets(db),
    db.contract.findUnique({
      where: { number },
      select: { application: { select: { quoted_on: true } } },
    }),
    loadVatRates(),
  ]);
  const customer = customers.find((c) => c.id === contract.customerId);

  // Rebuild the price-lock decision from the stored dates, to show both prices side by side.
  const quotedOn = application?.application.quoted_on ?? contract.signedOn;
  const items: SigningItem[] = [];
  // Quoted and signed on the same day: the stored price is the one that was locked (for a
  // second life it is the market value after refurbishment, not the price list).
  const sameDay = quotedOn === contract.signedOn;
  let secondLife = false;
  for (const item of contract.items) {
    const quoted = listPriceOn(priceLists, item.assetId, quotedOn);
    const signing = listPriceOn(priceLists, item.assetId, contract.signedOn);
    if (quoted.ok && signing.ok) {
      if (item.lifeNumber > 1 && item.listPriceCents !== signing.priceCents) secondLife = true;
      items.push({
        assetId: item.assetId,
        lifeNumber: item.lifeNumber,
        quantity: item.quantity,
        quotedPriceCents: sameDay ? item.listPriceCents : quoted.priceCents,
        quotedPriceListVersion: quoted.priceListVersion,
        signingPriceCents: sameDay ? item.listPriceCents : signing.priceCents,
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
  // Leaving early only makes sense while the lease runs.
  const exit =
    contract.status === 'active' && band && exitItems.length === contract.items.length
      ? {
          monthlyNetCents: contract.monthlyNetCents,
          termMonths: contract.termMonths,
          buyoutNetCents: contract.buyoutNetCents,
          annualInterestPercent: band.annual_interest_percent,
          items: exitItems,
          curves,
        }
      : undefined;

  // End of term (stream B): the items as we know them, and the buyout invoice it would create.
  const endItems = contract.items.flatMap((item) => {
    const asset = assets.find((a) => a.id === item.assetId);
    return asset
      ? [
          {
            assetId: asset.id,
            name: `${asset.make} ${asset.model}`,
            condition: asset.condition,
            usageUnit: asset.usage.unit,
            usageValue: asset.usage.value,
          },
        ]
      : [];
  });
  const buyoutPreview = endOfTerm(vatRates, contract, 'buy', endItems);
  const buyout =
    buyoutPreview.ok && buyoutPreview.invoice
      ? {
          netCents: buyoutPreview.invoice.netCents,
          grossCents: buyoutPreview.invoice.grossCents,
        }
      : null;

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
          {contract.status === 'active'
            ? t('contract.locked')
            : t(`contract.ended.${contract.status}`, {
                date: contract.endedOn ? formatIsoDate(contract.endedOn, locale) : '',
              })}
        </p>
      </div>

      <ContractTerms
        locale={locale}
        contract={contract}
        lock={lock}
        quotedOn={quotedOn}
        secondLife={secondLife}
      />
      <TimeTravel
        locale={locale}
        invoices={rentInvoices}
        startDate={contract.startDate}
        initialMonth={monthOn(rentInvoices, todayIso())}
        exit={exit}
      />
      <EndOfTermPanel
        locale={locale}
        number={contract.number}
        status={contract.status}
        endDate={termEndDate(contract.startDate, contract.termMonths)}
        endedOn={contract.endedOn}
        buyout={buyout}
        buyoutInvoice={buyoutInvoice}
        items={endItems}
      />
    </div>
  );
}
