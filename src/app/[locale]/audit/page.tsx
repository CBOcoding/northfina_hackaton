// The audit log: every change to business data, newest first. Rows are written by
// withAudit() in the same transaction as the change (src/server/audit.ts), so this list
// is the full story of what happened, and who did it.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { tOr } from '@/components/apply/helpers';
import { getT } from '@/i18n/get-t';
import { intlLocale, isLocale } from '@/i18n/locales';
import { listAuditLog } from '@/server/audit';
import { db } from '@/server/db';

const LIMIT = 100;

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/audit'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getT(locale);
  return { title: `${t('audit.title')} · ${t('brand.name')}` };
}

export default async function AuditPage({ params }: PageProps<'/[locale]/audit'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await connection();
  const t = getT(locale);
  const rows = await listAuditLog(db, LIMIT);
  const when = new Intl.DateTimeFormat(intlLocale[locale], {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Europe/Helsinki',
  });
  // Where an entity can be opened in the app.
  const href = (type: string, id: string) =>
    type === 'contract'
      ? `/${locale}/contracts/${encodeURIComponent(id)}`
      : type === 'asset'
        ? `/${locale}/second-life/${encodeURIComponent(id)}`
        : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('audit.title')}</h1>
      <p className="mt-2 max-w-3xl text-lg text-stone-700 dark:text-stone-300">
        {t('audit.intro', { limit: LIMIT })}
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-lg">{t('audit.empty')}</p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-800">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">{t('audit.title')}</caption>
            <thead className="bg-stone-100 dark:bg-stone-800">
              <tr>
                <th scope="col" className="px-4 py-3">
                  {t('audit.col.when')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('audit.col.action')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('audit.col.entity')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('audit.col.actor')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('audit.col.details')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const link = href(row.entity_type, row.entity_id);
                return (
                  <tr
                    key={row.id}
                    className="border-t border-stone-200 align-top dark:border-stone-800"
                  >
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      <time dateTime={row.created_at}>{when.format(new Date(row.created_at))}</time>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">
                        {tOr(t, `audit.action.${row.action}`, row.action)}
                      </span>
                      <span className="font-mono text-xs text-stone-600 dark:text-stone-400">
                        {row.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {link ? (
                        <Link
                          href={link}
                          className="text-emerald-800 underline underline-offset-4 dark:text-emerald-300"
                        >
                          {row.entity_id}
                        </Link>
                      ) : (
                        row.entity_id
                      )}
                    </td>
                    <td className="px-4 py-3">{row.actor}</td>
                    <td className="px-4 py-3">
                      {row.details === null ? (
                        '–'
                      ) : (
                        <details>
                          <summary className="cursor-pointer">{t('audit.show')}</summary>
                          <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-stone-100 p-3 text-xs dark:bg-stone-900">
                            {JSON.stringify(row.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
