import type { Metadata } from 'next'
import { isAppLocale, type AppLocale } from '@/lib/i18n/app-locale'
import { localizedCanonicalPath } from '@/lib/i18n/localized-metadata'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale: localeParam } = await params
  if (!isAppLocale(localeParam)) return {}
  const locale = localeParam as AppLocale
  return {
    title: 'Account',
    description:
      'Manage your Translation Ai account profile, email preferences, and security settings.',
    alternates: {
      canonical: localizedCanonicalPath(locale, 'profile'),
    },
    robots: { index: false, follow: false },
  }
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
