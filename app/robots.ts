import type { MetadataRoute } from 'next'
import { APP_LOCALES } from '@/lib/i18n/app-locale'
import { getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl()

  const localizedAuth = APP_LOCALES.flatMap((l) => [
    `/${l}/login`,
    `/${l}/register`,
    `/${l}/profile`,
  ])

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/login', '/register', '/profile', ...localizedAuth],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
