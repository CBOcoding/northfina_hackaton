// Second life of a returned item: refurbish or not, who on the waiting list gets it and at
// what rent, with every number shown. Then its passport and the CO₂ its lives saved.
// The rules live in src/domain/second-life.ts and circular-impact.ts; this page only shows them.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { LeaseAgain } from '@/components/second-life/lease-again';
import { Passport } from '@/components/second-life/passport';
import { WaitingList } from '@/components/second-life/waiting-list';
import { tOr } from '@/components/apply/helpers';
import {
  loadCo2Factors,
  loadCoefficientTable,
  loadPriceLists,
  loadRefurbishmentCosts,
  loadResidualCurves,
  loadSecondLifeDemand,
} from '@/data/load';
import type { AssetCondition } from '@/data/schemas';
import { circularImpact } from '@/domain/circular-impact';
import { marketValue } from '@/domain/market-value';
import { formatEuro } from '@/domain/money';
import { listPriceOn } from '@/domain/price-list';
import { matchSecondLife } from '@/domain/second-life';
import { formatIsoDate, formatNumber } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { toAsset } from '@/server/assets';
import { db } from '@/server/db';
import { servedWaitingListIds } from '@/server/second-life';
import { todayIso } from '@/server/today';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/second-life/[assetId]'>): Promise<Metadata> {
  const { assetId } = await params;
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: { make: true, model: true },
  });
  return asset ? { title: `${asset.make} ${asset.model} · Lease Loop` } : {};
}

export default async function SecondLifePage({
  params,
}: PageProps<'/[locale]/second-life/[assetId]'>) {
  const { locale, assetId } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const num = (value: number) => formatNumber(value, locale);
  // Lower case: the condition sits inside a sentence.
  const cond = (c: AssetCondition) => t(`condition.${c}`).toLowerCase();

  const row = await db.asset.findUnique({ where: { id: assetId } });
  if (!row) notFound();
  const asset = toAsset(row);
  const today = todayIso();
  const [priceLists, costs, curves, table, demand, co2, contractRows] = await Promise.all([
    loadPriceLists(),
    loadRefurbishmentCosts(),
    loadResidualCurves(),
    loadCoefficientTable(),
    loadSecondLifeDemand(),
    loadCo2Factors(),
    db.contractAsset.findMany({
      where: { asset_id: assetId },
      select: {
        life_number: true,
        list_price_cents: true,
        contract: { select: { number: true, signed_on: true, status: true } },
      },
      orderBy: { life_number: 'asc' },
    }),
  ]);

  const price = listPriceOn(priceLists, asset.id, today);
  const returned = asset.status === 'returned';
  const served = returned ? await servedWaitingListIds(db, demand) : [];
  const match =
    returned && price.ok
      ? matchSecondLife({
          asset,
          listPriceCents: price.priceCents,
          today,
          waitingList: demand,
          costs,
          curves,
          table,
          served,
        })
      : null;
  const winner = match?.winner ?? null;
  const plan = winner?.plan ?? null;
  const factors =
    winner && plan && price.ok
      ? marketValue(curves, {
          listPriceCents: price.priceCents,
          category: asset.category,
          ageMonths: match?.ageMonths ?? 0,
          condition: plan.conditionAfter,
          usageValue: plan.usageAfter,
        })
      : null;
  // A signed life keeps its CO₂: its locked price is the market value it went out at.
  const impact = circularImpact(co2, {
    category: asset.category,
    previousLives: asset.previous_lives,
    listPriceCents: price.ok ? price.priceCents : 0,
    recorded: contractRows.map((c) => ({ life: c.life_number, valueCents: c.list_price_cents })),
    nextValueCents: winner?.valueAfterCents ?? null,
  });
  // Signed but not back yet: the item is out on the life after its previous ones.
  const outNow = returned
    ? undefined
    : contractRows.find(
        (c) => c.life_number === asset.previous_lives + 1 && c.contract.status === 'active'
      );
  const winnerWho = winner
    ? `${tOr(t, `secondLife.who.${winner.request.id}`, winner.request.who)} (${winner.request.id})`
    : null;

  const whyKey = match?.decidedBy ?? 'only';
  const card =
    'rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900';

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${locale}`}
        className="text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
      >
        ← {t('secondLife.back')}
      </Link>
      <p className="mt-4 font-mono text-sm text-stone-600 dark:text-stone-400">
        {asset.id} · {asset.serial_number}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {asset.make} {asset.model}
      </h1>
      <p className="mt-1 text-lg text-stone-700 dark:text-stone-300">
        {outNow ? (
          <Link
            href={`/${locale}/contracts/${outNow.contract.number}`}
            className="font-medium text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
          >
            {t('secondLife.outOnLife', {
              n: outNow.life_number,
              number: outNow.contract.number,
            })}
          </Link>
        ) : (
          t('secondLife.subtitle', {
            condition: cond(asset.condition),
            usage: t(`usage.${asset.usage.unit}`, { value: num(asset.usage.value) }),
            lives: asset.previous_lives,
          })
        )}
      </p>

      {!returned ? (
        outNow ? null : (
          <p className={`mt-8 text-lg ${card}`}>{t('secondLife.notReturned')}</p>
        )
      ) : !winner || !plan || !winner.quote || !factors ? (
        <p className={`mt-8 text-lg ${card}`}>{t('secondLife.nobody')}</p>
      ) : (
        <>
          <section
            aria-labelledby="next-title"
            className="mt-8 rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-emerald-950 sm:p-8 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
          >
            <h2 id="next-title" className="text-2xl font-semibold sm:text-3xl">
              {t('secondLife.nextTitle', { who: winnerWho ?? '' })}
            </h2>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {t('secondLife.rent', {
                amount: eur(winner.quote.monthlyNetCents),
                term: winner.quote.termMonths,
              })}
            </p>
            <p className="mt-3 text-lg">
              {t(`secondLife.why.${whyKey}`, {
                who: winner.request.id,
                other: match?.runnerUp?.request.id ?? '',
                date: formatIsoDate(winner.request.needed_by, locale),
                condition: match?.runnerUp ? cond(match.runnerUp.request.min_condition) : '',
              })}
            </p>
            <LeaseAgain
              locale={locale}
              assetId={asset.id}
              who={winner.request.id}
              help={t('secondLife.leaseAgainHelp', {
                term: winner.quote.termMonths,
                rent: eur(winner.quote.monthlyNetCents),
                condition: cond(plan.conditionAfter),
              })}
            />
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="refurb-title" className={card}>
              <h2 id="refurb-title" className="text-xl font-semibold">
                {t('secondLife.refurbTitle')}
              </h2>
              <p className="mt-2 text-lg">
                {t('secondLife.refurbYes', { total: eur(plan.totalCents) })}
              </p>
              <ul className="mt-3 space-y-2">
                {plan.steps.map((step) => {
                  const [from, to] = step.id.split('->') as [AssetCondition, AssetCondition];
                  const label =
                    step.kind === 'upgrade'
                      ? t('secondLife.step.upgrade', { from: cond(from), to: cond(to) })
                      : tOr(t, `secondLife.step.${step.id}`, step.id);
                  return (
                    <li key={step.id} className="flex justify-between gap-4">
                      <span>
                        {step.times > 1 ? `${step.times} × ` : ''}
                        {label}
                      </span>
                      <span className="tabular-nums">{eur(step.costCents)}</span>
                    </li>
                  );
                })}
              </ul>
              {plan.upgradeCents > 0 && winner.upgradeGainCents !== null ? (
                <p className="mt-3 text-stone-700 dark:text-stone-300">
                  {t('secondLife.upgradePays', {
                    gain: eur(winner.upgradeGainCents),
                    cost: eur(plan.upgradeCents),
                  })}
                </p>
              ) : null}
              <p className="mt-3 text-stone-700 dark:text-stone-300">
                {t('secondLife.valueBefore', { value: eur(winner.valueBeforeCents) })}
              </p>
            </section>

            <section aria-labelledby="price-title" className={card}>
              <h2 id="price-title" className="text-xl font-semibold">
                {t('secondLife.priceTitle')}
              </h2>
              <p className="mt-2">
                {t('secondLife.priceFormula', {
                  list: eur(price.ok ? price.priceCents : 0),
                  curve: num(factors.curvePercent),
                  age: match?.ageMonths ?? 0,
                  multiplier: num(factors.conditionMultiplier),
                  condition: cond(plan.conditionAfter),
                  usage: num(100 + factors.usageAdjustmentPercent),
                })}
              </p>
              <p className="mt-2 text-lg font-semibold tabular-nums">
                {t('secondLife.priceResult', { value: eur(factors.valueCents) })}
              </p>
              <p className="mt-3">
                {t('secondLife.rentFormula', {
                  value: eur(factors.valueCents),
                  factor: new Intl.NumberFormat(intlLocale[locale], {
                    maximumFractionDigits: 6,
                  }).format(winner.quote.factorMicro / 1_000_000),
                  band: winner.quote.band,
                  term: winner.quote.termMonths,
                  rent: eur(winner.quote.monthlyNetCents),
                })}
              </p>
              <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
                {t('secondLife.priceNote')}
              </p>
            </section>
          </div>
        </>
      )}

      {match ? (
        <WaitingList
          candidates={match.candidates}
          winnerId={winner?.request.id ?? null}
          locale={locale}
          t={t}
        />
      ) : null}

      <Passport
        previousLives={asset.previous_lives}
        contracts={contractRows.map((c) => ({
          number: c.contract.number,
          signedOn: c.contract.signed_on,
          lifeNumber: c.life_number,
        }))}
        nextWho={winnerWho}
        impact={impact}
        locale={locale}
        t={t}
      />
    </div>
  );
}
