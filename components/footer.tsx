"use client"

import Link from 'next/link'
import { Github, Twitter, Globe, Chrome, MonitorSmartphone, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/use-translations'
import { useMarketingPrivacyHref } from '@/lib/i18n/marketing-href'

export function Footer() {
  const currentYear = new Date().getFullYear()
  const { t } = useI18n()
  const privacyHref = useMarketingPrivacyHref()

  return (
    <footer className="w-full border-t py-4 md:py-6">
      <div className="container px-4 mx-auto flex flex-col items-center gap-3 md:gap-4">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-full bg-background shadow-sm">
              <Chrome className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <div className="p-1.5 rounded-full bg-background shadow-sm">
              <MonitorSmartphone className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              {t('landing.footer.browsers')}
            </p>
          </div>
          <div className="h-4 w-px bg-border" />
          <Link
            href={privacyHref}
            className="flex items-center space-x-1.5 text-primary hover:underline"
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="text-xs" suppressHydrationWarning>
              {t('nav.privacy')}
            </span>
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 md:h-10 md:w-10">
            <a
              href="https://github.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4 md:h-5 md:w-5" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 md:h-10 md:w-10">
            <a
              href="https://x.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter"
            >
              <Twitter className="h-4 w-4 md:h-5 md:w-5" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 md:h-10 md:w-10">
            <a
              href="https://translation.ai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Website"
            >
              <Globe className="h-4 w-4 md:h-5 md:w-5" />
            </a>
          </Button>
        </div>
        <div className="text-xs text-muted-foreground" suppressHydrationWarning>
          © {currentYear} {t('appName')}. All rights reserved.
        </div>
      </div>
    </footer>
  )
} 