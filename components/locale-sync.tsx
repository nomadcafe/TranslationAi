'use client'

import { useEffect } from 'react'
import type { AppLocale } from '@/lib/i18n/app-locale'
import { useI18n } from '@/lib/i18n/use-translations'

/** Keep zustand UI language in sync with the `[locale]` URL segment. */
export function LocaleSync({ locale }: { locale: AppLocale }) {
  const setLanguage = useI18n((s) => s.setLanguage)

  useEffect(() => {
    setLanguage(locale)
  }, [locale, setLanguage])

  return null
}
