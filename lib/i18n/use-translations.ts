"use client"

import { create } from 'zustand'
import zhTranslations from './locales/zh.json'
import enTranslations from './locales/en.json'
import jaTranslations from './locales/ja.json'
import esTranslations from './locales/es.json'
import { isAppLocale, normalizeLocaleTag } from '@/lib/i18n/app-locale'

type I18nStore = {
  language: string
  translations: Record<string, any>
  setLanguage: (lang: string) => void
  t: (key: string, params?: Record<string, any>) => string
}

function pickTranslations(lang: string) {
  if (lang === 'zh') return zhTranslations
  if (lang === 'ja') return jaTranslations
  if (lang === 'es') return esTranslations
  return enTranslations
}

const getInitialLanguage = () => {
  if (typeof window === 'undefined') return 'zh'
  const stored = localStorage.getItem('language')
  if (isAppLocale(stored)) return stored
  return normalizeLocaleTag(navigator.language) ?? 'en'
}

export const useI18n = create<I18nStore>((set, get) => ({
  language: getInitialLanguage(),
  translations: pickTranslations(getInitialLanguage()),
  setLanguage: (lang: string) => {
    const next = isAppLocale(lang) ? lang : 'zh'
    const translations = pickTranslations(next)
    localStorage.setItem('language', next)
    set({ language: next, translations })
  },
  t: (key: string, params?: Record<string, any>) => {
    const { translations } = get()
    const keys = key.split('.')
    let value: any = translations
    
    // Walk nested keys (e.g. "foo.bar").
    for (const k of keys) {
      value = value?.[k]
      // Missing segment: fall back to the raw key.
      if (value === undefined) {
        console.warn(`Translation key not found: ${key}`)
        return key
      }
    }
    
    // Interpolate {placeholders} when params are provided.
    if (typeof value === 'string' && params) {
      return value.replace(/\{([^}]+)\}/g, (match, key) => {
        return params[key] !== undefined ? String(params[key]) : match
      })
    }
    
    return typeof value === 'string' ? value : key
  }
}))