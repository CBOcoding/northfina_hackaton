// The locked terms of a contract and, in plain words, why this price was locked.
import type { LockedPrice } from '@/domain/contract';
import { formatEuro } from '@/domain/money';
import type { ContractSnapshot } from '@/domain/types';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';

type Props = {
  locale: Locale;
  contract: ContractSnapshot;
  lock: LockedPrice | null;
  quotedOn: string;
  /** A returned item leased again: priced at its market value, not from the price list. */
  secondLife?: boolean;
};

export function ContractTerms({ locale, contract, lock, quotedOn, secondLife }: Props) {
  const t = getT(locale);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const factor = new Intl.NumberFormat(intlLocale[locale], { minimumFractionDigits: 6 }).format(
    contract.factorMicro / 1_000_000
  );

  const terms = [
    {
      label: secondLife
        ? t('contract.secondLifePrice', { life: contract.items[0]?.lifeNumber ?? 2 })
        : t('contract.listPrice', { version: contract.priceListVersion }),
      value: eur(contract.listPriceCents),
    },
    { label: t('contract.downPayment'), value: eur(contract.downPaymentCents) },
    { label: t('contract.financed'), value: eur(contract.financedCents) },
    { label: t('contract.bandFactor'), value: `${contract.band} · ${factor}` },
    { label: t('contract.monthlyNet'), value: eur(contract.monthlyNetCents) },
    { label: t('contract.term'), value: t('quote.termValue', { term: contract.termMonths }) },
    {
      label: t('contract.buyout', { percent: contract.buyoutPercent }),
      value: eur(contract.buyoutNetCents),
    },
    { label: t('contract.start'), value: formatIsoDate(contract.startDate, locale) },
  ];

  return (
    <section aria-labelledby="terms-title" className="mt-8 flex flex-col gap-4">
      <h2 id="terms-title" className="sr-only">
        {t('contract.termsTitle')}
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {terms.map((term) => (
          <div
            key={term.label}
            className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
          >
            <dt className="text-sm text-stone-600 dark:text-stone-400">{term.label}</dt>
            <dd className="mt-1 font-mono text-lg tabular-nums">{term.value}</dd>
          </div>
        ))}
      </dl>
      {lock ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
          {t(`contract.lockReason.${lock.reason}`, {
            quotedOn: formatIsoDate(quotedOn, locale),
            signedOn: formatIsoDate(contract.signedOn, locale),
            quoted: eur(lock.quotedTotalCents),
            signing: eur(lock.signingTotalCents),
            difference: eur(lock.differenceCents),
          })}
        </p>
      ) : null}
    </section>
  );
}
