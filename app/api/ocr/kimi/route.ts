import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireAuth } from '@/lib/server/require-auth'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { getKimiApiBaseUrl } from '@/lib/server/kimi-api-base'

const KIMI_API_KEY = process.env.KIMI_API_KEY

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const { image } = await request.json()
    
    if (!image) {
      return NextResponse.json(
        { error: apiMsg(locale, 'noImageDataProvided') },
        { status: 400 }
      )
    }

    if (!KIMI_API_KEY) {
      return NextResponse.json(
        { error: apiMsg(locale, 'kimiApiKeyNotFound') },
        { status: 500 }
      )
    }

    const base64Data = image.split(';base64,').pop() || image

    const openai = new OpenAI({
      apiKey: KIMI_API_KEY,
      baseURL: getKimiApiBaseUrl(),
    })

    const systemContent =
      locale === 'zh'
        ? '你是一个专业的图片文字识别助手。请提取图片中的所有文字，保持原有格式，不要添加任何解释。'
        : 'You are an OCR assistant. Extract all text from the image, preserve layout, no commentary.'
    const userText =
      locale === 'zh' ? '请提取这张图片中的所有文字：' : 'Extract all text from this image:'

    const response = await openai.chat.completions.create({
      model: 'moonshot-v1-32k-vision-preview',
      messages: [
        { role: 'system', content: systemContent },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ],
      temperature: 0.1
    })

    const extractedText = response.choices[0]?.message?.content
    if (!extractedText) {
      return NextResponse.json(
        { error: apiMsg(locale, 'noTextExtracted') },
        { status: 400 }
      )
    }

    return NextResponse.json({ text: extractedText.trim() })
  } catch (error: any) {
    console.error('Error extracting text with Kimi:', error)
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'ocrGenericFailed') },
      { status: 500 }
    )
  }
}
