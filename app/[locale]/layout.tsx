import { notFound } from 'next/navigation'
import { LocaleSync } from '@/components/locale-sync'
import { APP_LOCALES, isAppLocale, type AppLocale } from '@/lib/i18n/app-locale'

export function generateStaticParams() {
  return APP_LOCALES.map((locale) => ({ locale }))
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  if (!isAppLocale(params.locale)) notFound()

  return (
    <>
      <LocaleSync locale={params.locale as AppLocale} />
      {children}
    </>
  )
}
