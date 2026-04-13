import type { Metadata } from 'next'
import { isAppLocale, type AppLocale } from '@/lib/i18n/app-locale'
import { localizedCanonicalPath } from '@/lib/i18n/localized-metadata'

export async function generateMetadata({
  params,
}: {
  params: { locale: string }
}): Promise<Metadata> {
  if (!isAppLocale(params.locale)) return {}
  const locale = params.locale as AppLocale
  return {
    title: 'Sign in',
    description:
      'Sign in to Translation Ai to access your workspace, usage, billing, and subscription settings.',
    alternates: {
      canonical: localizedCanonicalPath(locale, 'login'),
    },
    robots: { index: false, follow: false },
  }
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
