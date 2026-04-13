import type { Metadata } from 'next'
import { isAppLocale, type AppLocale } from '@/lib/i18n/app-locale'
import { localizedCanonicalPath, marketingHreflangAlternates } from '@/lib/i18n/localized-metadata'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  if (!isAppLocale(params.locale)) return {}
  const locale = params.locale as AppLocale
  return {
    alternates: {
      canonical: localizedCanonicalPath(locale, ''),
      languages: marketingHreflangAlternates(''),
    },
  }
}

export default function MarketingSegmentLayout({ children }: { children: React.ReactNode }) {
  return children
}
