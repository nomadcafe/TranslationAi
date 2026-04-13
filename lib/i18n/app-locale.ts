/** UI + API (`X-App-Locale`) share this list. Add translations by extending the array and JSON files under `lib/i18n/api/`. */
export const APP_LOCALES = ['zh', 'en', 'ja', 'es'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

/** Bare URLs (`/login`, `/`, …) redirect here when cookie + Accept-Language don’t match. NextAuth `pages` use the same default. */
export const DEFAULT_PUBLIC_LOCALE: AppLocale = 'en'

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value != null && (APP_LOCALES as readonly string[]).includes(value)
}

/** BCP-47-ish hints → our short locale codes */
export function normalizeLocaleTag(tag: string): AppLocale | null {
  const t = tag.trim().toLowerCase()
  if (t.startsWith('zh')) return 'zh'
  if (t.startsWith('ja')) return 'ja'
  if (t.startsWith('es')) return 'es'
  if (t.startsWith('en')) return 'en'
  return null
}
