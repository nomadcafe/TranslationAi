import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/require-auth'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { qwenChatCompletionsUrl } from '@/lib/server/qwen-api-base'

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    if (!process.env.QWEN_API_KEY?.trim()) {
      return NextResponse.json({ message: apiMsg(locale, 'serviceNotConfigured') }, { status: 503 })
    }

    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ message: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ message: quota.error }, { status: 403 })

    const { image } = await request.json()

    if (!image) {
      return NextResponse.json(
        { message: apiMsg(locale, 'missingImageData') },
        { status: 400 }
      )
    }

    const ocrInstruction =
      locale === 'zh' ? '请读出图片中的所有文字。' : 'Read all the text in the image.'

    const response = await fetch(qwenChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen-vl-ocr',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${image}`
                },
                min_pixels: 28 * 28 * 4,
                max_pixels: 28 * 28 * 1280
              },
              {
                type: 'text',
                text: ocrInstruction
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || apiMsg(locale, 'ocrGenericFailed'))
    }

    const result = await response.json()
    const text = result.choices[0].message.content
    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Qwen OCR error:', error)
    return NextResponse.json(
      { message: error.message || apiMsg(locale, 'ocrGenericFailed') },
      { status: 500 }
    )
  }
}
