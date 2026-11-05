// Every invoice of a contract. Rows before the replay month are invoiced, the replay month is
// due, later ones are upcoming. A VAT rate different from the first invoice is highlighted.
import { formatEuro } from '@/domain/money';
import type { InvoiceLine } from '@/domain/types';
import { getT } from '@/i18n/get-t';
import { formatNumber } from '@/i18n/format';
import { intlLocale, type Locale } from '@/i18n/locales';

type Props = { locale: Locale; invoices: InvoiceLine[]; currentMonth: number };

export function InvoiceTable({ locale, invoices, currentMonth }: Props) {
  const t = getT(locale);
  const eur = (cents: number) => formatEuro(cents, intlLocale[locale]);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${iso}T00:00:00Z`)
    );
  const firstRate = invoices[0]?.vatRateBp;
  const chip = {
    invoiced: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    due: 'bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-50',
    upcoming: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
  };

  return (
    <div className="max-h-[28rem] overflow-auto rounded-xl border border-stone-200 dark:border-stone-800">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">{t('invoice.caption')}</caption>
        <thead className="sticky top-0 bg-stone-50 text-left text-stone-600 dark:bg-stone-900 dark:text-stone-400">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t('invoice.due')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('invoice.net')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('invoice.vatRate')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('invoice.vat')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('invoice.gross')}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t('invoice.status')}
            </th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const status =
              inv.seq < currentMonth ? 'invoiced' : inv.seq === currentMonth ? 'due' : 'upcoming';
            return (
              <tr
                key={inv.number}
                aria-current={status === 'due' ? 'step' : undefined}
                className={
                  'border-t border-stone-100 dark:border-stone-800 ' +
                  (status === 'due' ? 'bg-amber-50 font-semibold dark:bg-amber-950' : '')
                }
              >
                <td className="px-3 py-2 font-mono tabular-nums">{inv.seq}</td>
                <td className="px-3 py-2">{date(inv.dueDate)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{eur(inv.netCents)}</td>
                <td
                  className={
                    'px-3 py-2 text-right font-mono tabular-nums ' +
                    (inv.vatRateBp !== firstRate
                      ? 'font-semibold text-amber-800 dark:text-amber-300'
                      : '')
                  }
                >
                  {formatNumber(inv.vatRateBp / 100, locale)} %
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{eur(inv.vatCents)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {eur(inv.grossCents)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={'rounded-full px-2 py-0.5 text-xs font-semibold ' + chip[status]}
                  >
                    {t(`invoice.status.${status}`)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
