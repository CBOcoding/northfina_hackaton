// Next.js 16 "proxy" (it was called middleware before Next 16). It runs before routing.
// Here it only sends the bare root URL to the default language: `/` → `/en`.
// Picking the language from the Accept-Language header would also go here.
import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale } from '@/i18n/locales';

export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL(`/${defaultLocale}`, request.url));
}

export const config = {
  matcher: '/',
};
