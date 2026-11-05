// The quote page links here with the chosen term and down payment. The application page takes
// the item as a query parameter, so forward everything there.
import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/i18n/locales';

export default async function ApplyForAssetPage({
  params,
  searchParams,
}: PageProps<'/[locale]/apply/[assetId]'>) {
  const { locale, assetId } = await params;
  if (!isLocale(locale)) notFound();
  const query = await searchParams;

  const target = new URLSearchParams({ asset: assetId });
  for (const key of ['term', 'down']) {
    const value = query[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) target.set(key, first);
  }
  redirect(`/${locale}/apply?${target}`);
}
