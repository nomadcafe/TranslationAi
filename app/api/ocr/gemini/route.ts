import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/require-auth'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'serviceNotConfigured') }, { status: 500 })

    const { image } = await request.json()
    if (!image) return NextResponse.json({ error: apiMsg(locale, 'missingImage') }, { status: 400 })

    const base64Data = typeof image === 'string' ? image.replace(/^data:.*?;base64,/, '') : image
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const instruction =
      locale === 'zh'
        ? '请提取图片中的所有文字，以纯文本返回。尽量保持原有结构与版式；如有多语言请全部保留。'
        : 'Extract all text from this image as plain text. Preserve structure and layout. If multiple languages appear, keep them all.'

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data,
        },
      },
      instruction,
    ])
    const response = await result.response
    const text = response.text()
    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Gemini OCR error:', error)
    return NextResponse.json({ error: error.message || apiMsg(locale, 'ocrFailed') }, { status: 500 })
  }
}
