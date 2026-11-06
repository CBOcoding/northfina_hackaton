// Signing an approved application. The page shows the contract exactly as it will be stored
// (prepared by the same code that signs), why this price is locked, and a simulated
// e-signature: the signer types their name and accepts the terms. There is no login in this
// app; a real product would use strong identification here (e.g. bank ID).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { tOr } from '@/components/apply/helpers';
import { SignForm } from '@/components/sign/sign-form';
import { loadCustomers } from '@/data/load';
import { formatEuro } from '@/domain/money';
import { formatIsoDate } from '@/i18n/format';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import {
  getSignableApplication,
  isSignable,
  leaseFromApplication,
  loadLeaseData,
  prepareLease,
} from '@/server/contracts';
import { db } from '@/server/db';
import { todayIso } from '@/server/today';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/sign/[applicationId]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: `${t('sign.title')} · ${t('brand.name')}` };
}

export default async function SignPage({ params }: PageProps<'/[locale]/sign/[applicationId]'>) {
  const { locale, applicationId } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);

  const application = await getSignableApplication(db, applicationId);
  if (!application) notFound();
  if (application.contractNumber) redirect(`/${locale}/contracts/${application.contractNumber}`);

  const [customers, data] = await Promise.all([loadCustomers(), loadLeaseData()]);
  const customer = customers.find((c) => c.id === application.customerId);
  const today = todayIso();
  // Companies whose applicant cannot sign: the authorised signatory signs (card 6). The
  // eligibility decision says so, whatever the applicant answered to q_can_sign.
  const signatoryOnly = application.reasons.includes('SIGNATORY_REQUIRED');
  const signatoryEmail =
    typeof application.answers.q_signatory_email === 'string'
      ? application.answers.q_signatory_email
      : '';
  const suggestedSigner = signatoryOnly ? signatoryEmail : (customer?.name ?? '');

  const signable = isSignable(application);
  const prepared = signable
    ? await prepareLease(db, data, leaseFromApplication(application, suggestedSigner || '-', today))
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="font-mono text-sm text-stone-600 dark:text-stone-400">
        {t('sign.application', { id: application.id.slice(0, 8) })}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">{t('sign.title')}</h1>
      <p className="mt-1 text-stone-700 dark:text-stone-300">
        {customer?.name ?? application.customerId}
      </p>

      {signatoryOnly && signable ? (
        <p
          role="status"
          className="mt-6 rounded-xl bg-sky-50 p-5 text-sky-950 ring-1 ring-sky-200 ring-inset dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-800"
        >
          {t('sign.waitingFor', { email: signatoryEmail || '-' })}
        </p>
      ) : null}
      {!signable ? (
        <p
          role="status"
          className="mt-6 rounded-xl bg-amber-50 p-5 text-amber-950 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
        >
          {t('sign.notApproved')}
        </p>
      ) : !prepared || !prepared.ok ? (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-amber-50 p-5 text-amber-950 ring-1 ring-amber-200 ring-inset dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
        >
          {tOr(
            t,
            `sign.reason.${prepared && !prepared.ok ? prepared.reason.toUpperCase() : ''}`,
            t('sign.reason.generic')
          )}
        </p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3">
            {[
              {
                k: t('sign.items'),
                v: prepared.contract.items
                  .map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.assetId}` : i.assetId))
                  .join(', '),
              },
              {
                k: t('contract.term'),
                v: t('quote.termValue', { term: prepared.contract.termMonths }),
              },
              {
                k: t('contract.listPrice', { version: prepared.contract.priceListVersion }),
                v: eur(prepared.contract.listPriceCents),
              },
              { k: t('contract.downPayment'), v: eur(prepared.contract.downPaymentCents) },
              { k: t('contract.monthlyNet'), v: eur(prepared.contract.monthlyNetCents) },
              {
                k: t('sign.firstInvoice', {
                  date: formatIsoDate(prepared.contract.startDate, locale),
                }),
                v: eur(prepared.invoices[0]?.grossCents ?? 0),
              },
            ].map((row) => (
              <div
                key={row.k}
                className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
              >
                <dt className="text-sm text-stone-600 dark:text-stone-400">{row.k}</dt>
                <dd className="mt-1 font-mono text-lg tabular-nums">{row.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
            {t(`contract.lockReason.${prepared.lock.reason}`, {
              quotedOn: formatIsoDate(application.quotedOn, locale),
              signedOn: formatIsoDate(today, locale),
              quoted: eur(prepared.lock.quotedTotalCents),
              signing: eur(prepared.lock.signingTotalCents),
              difference: eur(prepared.lock.differenceCents),
            })}
          </p>
          <SignForm
            locale={locale}
            applicationId={application.id}
            suggestedSigner={suggestedSigner}
            signatoryOnly={signatoryOnly}
          />
        </>
      )}

      <Link
        href={`/${locale}`}
        className="mt-8 inline-block text-sm font-medium text-emerald-800 underline-offset-4 hover:underline dark:text-emerald-300"
      >
        ← {t('quote.backToCatalogue')}
      </Link>
    </div>
  );
}
