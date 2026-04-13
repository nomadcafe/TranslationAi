'use client'

import { apiFetch } from '@/lib/api-fetch'

/** Translation goes through the server API; no API keys in the browser. */
export async function translateWithDeepSeek(text: string, targetLang: string): Promise<string> {
  const res = await apiFetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetLanguage: targetLang, service: 'deepseek' }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '翻译请求失败')
  }
  const data = await res.json()
  return data.text ?? ''
}

export async function extractTextWithDeepseek(file: File): Promise<string> {
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiFetch('/api/file/extract', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || '文件识别失败')
    }

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || '文件识别失败')
    }

    return data.result
  } catch (error: any) {
    console.error('DeepSeek文件识别错误:', error)
    throw error
  }
} 