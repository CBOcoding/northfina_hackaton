'use client';

// Simulated e-signature: type your name and accept the terms. The server signs the stored
// application (items and terms are not sent from here) and we open the new contract.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { tOr } from '@/components/apply/helpers';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type Props = {
  locale: Locale;
  applicationId: string;
  suggestedSigner: string;
  signatoryOnly: boolean;
};

export function SignForm({ locale, applicationId, suggestedSigner, signatoryOnly }: Props) {
  const t = getT(locale);
  const router = useRouter();
  const nameId = useId();
  const acceptId = useId();
  const [signedBy, setSignedBy] = useState(suggestedSigner);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The button is disabled while signing, so focus would be lost: take it to the error.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function sign(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId, signedBy: signedBy.trim(), actor: signedBy.trim() }),
      });
      const body = (await response.json()) as
        | { success: true; data: { contract: { number: string } } }
        | { success: false; error: { code: string } };
      if (body.success) {
        router.push(`/${locale}/contracts/${body.data.contract.number}`);
        return;
      }
      setError(tOr(t, `sign.reason.${body.error.code}`, t('sign.reason.generic')));
    } catch {
      setError(t('sign.reason.NETWORK'));
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={sign}
      className="mt-6 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
    >
      <h2 className="text-xl font-semibold">{t('sign.formTitle')}</h2>
      {signatoryOnly ? (
        <p className="text-sm text-stone-700 dark:text-stone-300">{t('sign.signatoryOnly')}</p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="font-medium">
          {t('sign.name')}
        </label>
        <input
          id={nameId}
          required
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          autoComplete="name"
          className="min-h-11 rounded-lg border border-stone-300 px-3 dark:border-stone-600 dark:bg-stone-950"
        />
      </div>
      <label htmlFor={acceptId} className="flex items-start gap-3">
        <input
          id={acceptId}
          type="checkbox"
          required
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 size-5 accent-emerald-700"
        />
        <span>{t('sign.accept')}</span>
      </label>
      <p className="text-sm text-stone-600 dark:text-stone-400">{t('sign.simulated')}</p>
      {error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-red-900 dark:bg-red-950 dark:text-red-100"
        >
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !accepted || signedBy.trim() === ''}
        className="min-h-12 rounded-full bg-emerald-700 px-6 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t('sign.busy') : t('sign.submit')}
      </button>
    </form>
  );
}
