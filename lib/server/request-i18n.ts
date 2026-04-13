/**
 * API user-facing strings: edit JSON under lib/i18n/api/ (zh + en required; ja/es override via same keys).
 * Lookup order: requested locale → en → zh → key name.
 */
import zh from '@/lib/i18n/api/zh.json'
import en from '@/lib/i18n/api/en.json'
import ja from '@/lib/i18n/api/ja.json'
import es from '@/lib/i18n/api/es.json'
import type { AppLocale } from '@/lib/i18n/app-locale'
import { isAppLocale, normalizeLocaleTag } from '@/lib/i18n/app-locale'

export type { AppLocale } from '@/lib/i18n/app-locale'

export type ApiMessageKey = keyof typeof zh

const bundles: Record<AppLocale, Partial<Record<ApiMessageKey, string>>> = {
  zh,
  en,
  ja,
  es,
}

function pick(locale: AppLocale, key: ApiMessageKey): string | undefined {
  const v = bundles[locale]?.[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function apiMsg(locale: AppLocale, key: ApiMessageKey): string {
  return pick(locale, key) ?? pick('en', key) ?? pick('zh', key) ?? String(key)
}

export function getRequestLocale(request: Request): AppLocale {
  const raw = request.headers.get('x-app-locale')?.trim().toLowerCase() ?? ''
  if (isAppLocale(raw)) return raw
  if (raw.startsWith('ja')) return 'ja'
  if (raw.startsWith('es')) return 'es'
  if (raw.startsWith('zh')) return 'zh'
  if (raw.startsWith('en')) return 'en'

  const al = request.headers.get('accept-language') || ''
  const first = al.split(',')[0]?.split(';')[0]?.trim() || ''
  const fromHeader = normalizeLocaleTag(first)
  if (fromHeader) return fromHeader

  if (/^\s*en/i.test(al)) return 'en'
  return 'zh'
}
