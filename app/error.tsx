'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/use-translations'
import { useMarketingHomeHref } from '@/lib/i18n/marketing-href'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useI18n((s) => s.t)
  const homeHref = useMarketingHomeHref()

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error(error)
    }
  }, [error])

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">{t('error.boundaryTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('error.boundaryDescription')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={() => reset()}>
          {t('error.retryButton')}
        </Button>
        <Button variant="outline" asChild>
          <Link href={homeHref}>{t('error.homeButton')}</Link>
        </Button>
      </div>
    </div>
  )
}
