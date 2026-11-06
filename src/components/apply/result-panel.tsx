'use client';

// The outcome of an application: one big headline, then each reason in plain words.
import Link from 'next/link';
import { forwardRef } from 'react';
import { formatEuro } from '@/domain/money';
import type { Answers } from '@/domain/question-flow';
import { formatIsoDate } from '@/i18n/format';
import type { Translate } from '@/i18n/get-t';
import { intlLocale, type Locale } from '@/i18n/locales';
import { eighteenthBirthday, tOr } from './helpers';

export type ApplyResult = {
  applicationId: string;
  decision: 'pending' | 'approved' | 'rejected' | 'manual_review';
  reasons: { code: string }[];
  monthlyGrossCents: number | null;
};

const tone: Record<ApplyResult['decision'], string> = {
  approved:
    'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
  rejected:
    'border-stone-300 bg-stone-100 text-stone-900 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100',
  pending:
    'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
  manual_review:
    'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100',
};

type Props = {
  result: ApplyResult;
  answers: Answers;
  locale: Locale;
  t: Translate;
  onEdit: () => void;
};

export const ResultPanel = forwardRef<HTMLHeadingElement, Props>(function ResultPanel(
  { result, answers, locale, t, onEdit },
  headingRef
) {
  const { decision, reasons, monthlyGrossCents } = result;
  const signatory =
    typeof answers.q_signatory_email === 'string' ? answers.q_signatory_email : null;
  const birth =
    typeof answers.q_birth_date === 'string' ? eighteenthBirthday(answers.q_birth_date) : null;

  return (
    <section
      aria-labelledby="result-title"
      className={`rounded-2xl border p-6 sm:p-8 ${tone[decision]}`}
    >
      <h2
        id="result-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold sm:text-3xl"
      >
        {t(`apply.result.${decision}.title`)}
      </h2>
      <p className="mt-3 text-lg">{t(`apply.result.${decision}.body`)}</p>

      {decision === 'approved' && monthlyGrossCents !== null ? (
        <p className="mt-4 text-xl font-semibold tabular-nums">
          {t('apply.result.monthly', { amount: formatEuro(monthlyGrossCents, intlLocale[locale]) })}
        </p>
      ) : null}
      {decision === 'approved' ? (
        <Link
          href={`/${locale}/sign/${result.applicationId}`}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-emerald-800 px-5 py-2 text-base font-semibold text-white hover:bg-emerald-900 dark:bg-emerald-300 dark:text-emerald-950 dark:hover:bg-emerald-200"
        >
          {t('apply.result.sign')}
        </Link>
      ) : null}

      {reasons.length > 0 ? (
        <>
          <h3 className="mt-6 text-lg font-semibold">
            {decision === 'approved' ? t('apply.result.goodToKnow') : t('apply.result.why')}
          </h3>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-lg">
            {reasons.map(({ code }) => (
              <li key={code}>{tOr(t, `apply.reason.${code}`, t('apply.reason.UNKNOWN'))}</li>
            ))}
          </ul>
        </>
      ) : null}

      {reasons.some((r) => r.code === 'MIN_AGE') && birth ? (
        <p className="mt-4 text-lg font-medium">
          {t('apply.result.adultOn', { date: formatIsoDate(birth, locale) })}
        </p>
      ) : null}
      {reasons.some((r) => r.code === 'SIGNATORY_REQUIRED') && signatory ? (
        <>
          <p className="mt-4 text-lg font-medium">
            {t('apply.result.signatory', { email: signatory })}
          </p>
          <Link
            href={`/${locale}/sign/${result.applicationId}`}
            className="mt-4 inline-flex min-h-12 items-center rounded-full border border-current px-5 font-semibold underline-offset-4 hover:underline"
          >
            {t('apply.result.signatoryLink')}
          </Link>
        </>
      ) : null}

      <p className="mt-6 text-sm">{t('apply.result.reference', { id: result.applicationId })}</p>
      <button
        type="button"
        onClick={onEdit}
        className="mt-4 min-h-11 rounded-full border border-current px-4 py-2 text-base font-medium"
      >
        {t('apply.result.edit')}
      </button>
    </section>
  );
});
