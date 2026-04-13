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
    title: 'Sign up',
    description:
      'Create a Translation Ai account to start translating with AI across text, documents, speech, and video.',
    alternates: {
      canonical: localizedCanonicalPath(locale, 'register'),
    },
    robots: { index: false, follow: false },
  }
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
