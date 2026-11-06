'use client';

// "Lease it to …": signs the next life of a returned item. The server decides who, at what
// price and after which work, with the same rules this page shows.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getT } from '@/i18n/get-t';
import type { Locale } from '@/i18n/locales';

type Props = {
  locale: Locale;
  assetId: string;
  who: string;
  help: string;
};

export function LeaseAgain({ locale, assetId, who, help }: Props) {
  const t = getT(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The button is disabled while signing, so focus would be lost: take it to the error.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function lease() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/second-life/${encodeURIComponent(assetId)}/lease`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actor: 'staff' }),
      });
      const body = (await response.json()) as
        { success: true; data: { number: string } } | { success: false };
      if (body.success) {
        router.push(`/${locale}/contracts/${body.data.number}`);
        return;
      }
      setError(true);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  return (
    <div className="mt-6 flex flex-col gap-2">
      <button
        type="button"
        onClick={lease}
        disabled={busy}
        className="min-h-12 self-start rounded-full bg-emerald-700 px-6 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {busy ? t('secondLife.leaseAgainBusy') : t('secondLife.leaseAgain', { who })}
      </button>
      <p className="text-sm">{help}</p>
      {error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-sm font-medium text-red-800 dark:text-red-300"
        >
          {t('secondLife.leaseAgainError')}
        </p>
      ) : null}
    </div>
  );
}
