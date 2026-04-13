'use client'

import { apiFetch } from '@/lib/api-fetch'

/** All capabilities use server-side APIs; no API keys in the browser. */

export async function extractTextFromImage(imageData: string): Promise<string> {
  const res = await apiFetch('/api/ocr/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageData }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '图片识别失败')
  }
  const data = await res.json()
  return data.text ?? ''
}

export const extractTextWithGemini = extractTextFromImage

export async function translateText(text: string, targetLang: string): Promise<string> {
  const res = await apiFetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLanguage: targetLang, service: 'gemini' }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '翻译失败')
  }
  const data = await res.json()
  return data.text ?? ''
}

export async function improveText(text: string, targetLang: string): Promise<string> {
  const res = await apiFetch('/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLang }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '润色失败')
  }
  const data = await res.json()
  return data.text ?? ''
}
