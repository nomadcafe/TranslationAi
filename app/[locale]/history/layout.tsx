import type { Metadata } from 'next'
import { isAppLocale, type AppLocale } from '@/lib/i18n/app-locale'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: localeParam } = await params
  if (!isAppLocale(localeParam)) return {}
  const locale = localeParam as AppLocale
  return {
    title: 'Translation History',
    description: 'Review, search, and favorite your past translations.',
    alternates: {
      canonical: `/${locale}/history`,
    },
    robots: { index: false, follow: false },
  }
}

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children
}
