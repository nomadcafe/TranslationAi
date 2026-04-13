import type { MetadataRoute } from 'next'
import { APP_LOCALES } from '@/lib/i18n/app-locale'
import { getSiteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl()
  const now = new Date()

  const localized = APP_LOCALES.flatMap((locale) => [
    { url: `${base}/${locale}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 1 },
    {
      url: `${base}/${locale}/translate`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${base}/${locale}/pricing`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: `${base}/${locale}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.4,
    },
  ])

  return localized
}
