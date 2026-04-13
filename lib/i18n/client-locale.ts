import type { AppLocale } from '@/lib/i18n/app-locale'
import { isAppLocale, normalizeLocaleTag } from '@/lib/i18n/app-locale'

export type { AppLocale }

/** Browser: localStorage → navigator (zh/ja/es/en) → else en. SSR (no window) → zh. */
export function getClientAppLocale(): AppLocale {
  if (typeof window === 'undefined') return 'zh'
  const stored = localStorage.getItem('language')
  if (isAppLocale(stored)) return stored
  return normalizeLocaleTag(navigator.language) ?? 'en'
}
