import { notFound } from 'next/navigation'
import { LocaleSync } from '@/components/locale-sync'
import { APP_LOCALES, isAppLocale, type AppLocale } from '@/lib/i18n/app-locale'

export function generateStaticParams() {
  return APP_LOCALES.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()

  return (
    <>
      <LocaleSync locale={locale as AppLocale} />
      {children}
    </>
  )
}
