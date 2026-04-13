import { APP_LOCALES, type AppLocale } from '@/lib/i18n/app-locale'
import { getSiteUrl } from '@/lib/site'

type PublicLocaleSlug = '' | 'pricing' | 'privacy' | 'translate' | 'login' | 'register' | 'profile'

export function localizedCanonicalPath(locale: AppLocale, slug: PublicLocaleSlug): string {
  if (slug === '') return `/${locale}`
  return `/${locale}/${slug}`
}

/** Absolute URLs per locale for `alternates.languages` (hreflang). */
export function marketingHreflangAlternates(slug: PublicLocaleSlug): Record<string, string> {
  const base = getSiteUrl()
  const tail = slug === '' ? '' : `/${slug}`
  const entries = APP_LOCALES.map((l) => [l, `${base}/${l}${tail}`] as const)
  return Object.fromEntries(entries)
}
