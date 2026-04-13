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
  const canonical = localizedCanonicalPath(locale, 'translate')
  return {
    title: 'Online Translation',
    description:
      'Translate text, images, PDFs, speech, and video with AI. Fast, accurate multilingual output for work and study.',
    alternates: {
      canonical,
      languages: marketingHreflangAlternates('translate'),
    },
    openGraph: {
      title: 'Online Translation | Translation Ai',
      description:
        'Translate text, images, PDFs, speech, and video with AI. Fast, accurate multilingual output for work and study.',
      url: canonical,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Translation Ai - Translation Page',
        },
      ],
    },
  }
}

export default function TranslateLayout({ children }: { children: React.ReactNode }) {
  return children
}
