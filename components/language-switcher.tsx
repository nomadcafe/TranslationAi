"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Languages } from "lucide-react"
import { useI18n } from "@/lib/i18n/use-translations"
import { useSwitchLocaleNav } from "@/lib/i18n/marketing-href"

export function LanguageSwitcher() {
  const { language, t } = useI18n()
  const switchLocale = useSwitchLocaleNav()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only" suppressHydrationWarning>{t('switchLanguage')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => switchLocale('zh')}
          className={language === 'zh' ? 'bg-accent' : ''}
        >
          <span suppressHydrationWarning>{t('languages.chinese')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => switchLocale('en')}
          className={language === 'en' ? 'bg-accent' : ''}
        >
          <span suppressHydrationWarning>{t('languages.english')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => switchLocale('ja')}
          className={language === 'ja' ? 'bg-accent' : ''}
        >
          <span suppressHydrationWarning>{t('languages.japanese')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => switchLocale('es')}
          className={language === 'es' ? 'bg-accent' : ''}
        >
          <span suppressHydrationWarning>{t('languages.spanish')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}