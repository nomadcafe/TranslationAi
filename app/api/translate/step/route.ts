import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireAuth } from '@/lib/server/require-auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

export async function POST(req: Request) {
  const locale = getRequestLocale(req)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })

    const apiKey = process.env.STEP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotConfigured') }, { status: 500 })
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.stepfun.ai/v1'
    })

    const { text, targetLanguage } = await req.json()

    if (!text) {
      return NextResponse.json({ error: apiMsg(locale, 'textRequired') }, { status: 400 })
    }

    if (!targetLanguage) {
      return NextResponse.json({ error: apiMsg(locale, 'targetLanguageRequired') }, { status: 400 })
    }

    const systemContent =
      locale === 'zh'
        ? `你是专业译者。将下列文本翻译成 ${targetLanguage}，保持原有格式与风格。`
        : `You are a professional translator. Translate the following text to ${targetLanguage}. Keep the original format and style.`

    const completion = await openai.chat.completions.create({
      model: 'step-2-16k',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: text }
      ],
      temperature: 0.3,
      max_tokens: 2000
    })

    const translation = completion.choices[0]?.message?.content || ''
    if (!translation) {
      return NextResponse.json({ error: apiMsg(locale, 'noTranslationResult') }, { status: 500 })
    }

    return NextResponse.json({ translation })
  } catch (error: any) {
    console.error('Translation error:', error)
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'internalServerError') },
      { status: error.status || 500 }
    )
  }
}
