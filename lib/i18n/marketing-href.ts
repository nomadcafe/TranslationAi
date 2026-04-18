'use client'

import { usePathname, useRouter } from 'next/navigation'
import { isAppLocale, type AppLocale } from '@/lib/i18n/app-locale'
import { useI18n } from '@/lib/i18n/use-translations'

/** Locale from URL when on /[locale]/..., else from zustand (fallback `en`). */
export function useMarketingLocalePrefix(): AppLocale {
  const pathname = usePathname()
  const storeLang = useI18n((s) => s.language)
  const first = pathname.split('/').filter(Boolean)[0]
  if (isAppLocale(first)) return first
  return isAppLocale(storeLang) ? storeLang : 'en'
}

export function useMarketingHomeHref(): string {
  return `/${useMarketingLocalePrefix()}`
}

export function useMarketingPricingHref(): string {
  return `/${useMarketingLocalePrefix()}/pricing`
}

export function useMarketingPrivacyHref(): string {
  return `/${useMarketingLocalePrefix()}/privacy`
}

export function useTranslateHref(): string {
  return `/${useMarketingLocalePrefix()}/translate`
}

export function useLoginHref(): string {
  return `/${useMarketingLocalePrefix()}/login`
}

export function useRegisterHref(): string {
  return `/${useMarketingLocalePrefix()}/register`
}

export function useProfileHref(): string {
  return `/${useMarketingLocalePrefix()}/profile`
}

export function useHistoryHref(): string {
  return `/${useMarketingLocalePrefix()}/history`
}

/** On `/[locale]/...` URLs, switching language updates the path segment. */
export function useSwitchLocaleNav() {
  const pathname = usePathname()
  const router = useRouter()
  const setLanguage = useI18n((s) => s.setLanguage)

  return (lang: AppLocale) => {
    setLanguage(lang)
    const parts = pathname.split('/').filter(Boolean)
    if (parts.length > 0 && isAppLocale(parts[0])) {
      parts[0] = lang
      router.push('/' + parts.join('/'))
    }
  }
}
