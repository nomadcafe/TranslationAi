'use client'

import { apiFetch } from '@/lib/api-fetch'

/** Keyed capabilities use server-side APIs; no API keys in the browser. */

export async function extractVideoFrames(videoFile: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1]
      resolve([base64Data])
    }
    reader.onerror = () => reject(new Error('视频处理失败'))
    reader.readAsDataURL(videoFile)
  })
}

export async function analyzeVideoContent(frames: string[]): Promise<string> {
  const res = await apiFetch('/api/zhipu/analyze-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '视频分析失败')
  }
  const data = await res.json()
  return data.text ?? ''
}

export async function extractTextWithZhipu(imageBase64: string): Promise<string> {
  const res = await apiFetch('/api/ocr/zhipu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '文字识别失败')
  }
  const data = await res.json()
  return data.text ?? ''
}

export async function extractFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = async () => {
      try {
        const dataUrl = reader.result as string
        const base64Data = dataUrl.replace(/^data:.*?;base64,/, '')
        const mimeType = file.type || 'application/octet-stream'
        const res = await apiFetch('/api/zhipu/extract-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data, mimeType }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          reject(new Error(err.error || '文件识别失败'))
          return
        }
        const data = await res.json()
        resolve(data.text ?? '')
      } catch (e: any) {
        reject(new Error(e.message || '文件识别失败'))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
