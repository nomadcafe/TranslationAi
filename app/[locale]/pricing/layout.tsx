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
  const canonical = localizedCanonicalPath(locale, 'pricing')
  return {
    title: 'Pricing',
    description:
      'Translation Ai pricing: Free, Pro, and Enterprise tiers with clear usage limits for AI translation across text, files, audio, and video.',
    alternates: {
      canonical,
      languages: marketingHreflangAlternates('pricing'),
    },
    openGraph: {
      title: 'Pricing | Translation Ai',
      description:
        'Translation Ai pricing: Free, Pro, and Enterprise tiers with clear usage limits for AI translation across text, files, audio, and video.',
      url: canonical,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Translation Ai - Pricing Page',
        },
      ],
    },
  }
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
