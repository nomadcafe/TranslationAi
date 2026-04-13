import type { Metadata } from 'next'
import { isAppLocale, type AppLocale } from '@/lib/i18n/app-locale'
import { localizedCanonicalPath, marketingHreflangAlternates } from '@/lib/i18n/localized-metadata'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: localeParam } = await params
  if (!isAppLocale(localeParam)) return {}
  const locale = localeParam as AppLocale
  const canonical = localizedCanonicalPath(locale, 'privacy')
  return {
    title: 'Privacy',
    description:
      'Translation Ai privacy policy: how we collect, use, store, and protect your data when you use our translation and content processing services.',
    alternates: {
      canonical,
      languages: marketingHreflangAlternates('privacy'),
    },
  }
}

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children
}
