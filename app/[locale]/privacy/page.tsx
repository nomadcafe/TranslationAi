'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n/use-translations'
import { useMarketingHomeHref, useMarketingPricingHref } from '@/lib/i18n/marketing-href'

const SECTION_KEYS = [
  { h: 'privacy.s1h' as const, p: 'privacy.s1p' as const },
  { h: 'privacy.s2h' as const, p: 'privacy.s2p' as const },
  { h: 'privacy.s3h' as const, p: 'privacy.s3p' as const },
  { h: 'privacy.s4h' as const, p: 'privacy.s4p' as const },
  { h: 'privacy.s5h' as const, p: 'privacy.s5p' as const },
  { h: 'privacy.s6h' as const, p: 'privacy.s6p' as const },
]

export default function PrivacyPage() {
  const { t } = useI18n()
  const homeHref = useMarketingHomeHref()
  const pricingHref = useMarketingPricingHref()

  return (
    <div className="container max-w-3xl py-16 px-4">
      <p className="text-sm text-muted-foreground mb-2">
        <Link href={homeHref} className="hover:text-foreground hover:underline">
          {t('nav.home')}
        </Link>
        <span className="mx-2">/</span>
        <span>{t('privacy.title')}</span>
      </p>
      <h1 className="text-4xl font-bold tracking-tight mb-3">{t('privacy.title')}</h1>
      <p className="text-sm text-muted-foreground mb-10">{t('privacy.updated')}</p>

      {SECTION_KEYS.map(({ h, p }) => (
        <section key={h} className="mb-10">
          <h2 className="text-xl font-semibold mb-3">{t(h)}</h2>
          <div className="text-muted-foreground leading-relaxed whitespace-pre-line">{t(p)}</div>
        </section>
      ))}

      <p className="text-sm text-muted-foreground pt-6 border-t">
        <Link href={pricingHref} className="text-primary font-medium hover:underline">
          {t('privacy.backToPricing')}
        </Link>
      </p>
    </div>
  )
}
