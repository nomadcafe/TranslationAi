import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { TranslateBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'
import { saveTranslation } from '@/lib/server/translations'

export const POST = withAuth(async (req, auth) => {
  const locale = getRequestLocale(req)
  try {
    const apiKey = process.env.STEP_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotConfigured') }, { status: 500 })
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.stepfun.ai/v1'
    })

    const parsed = await parseJson(req, TranslateBody, locale)
    if (!parsed.ok) return parsed.response
    const { text, targetLanguage } = parsed.data

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

    void saveTranslation({
      userId: auth.userId,
      sourceText: text,
      translatedText: translation,
      targetLanguage,
      service: 'step',
    })
    return NextResponse.json({ translation })
  } catch (error: any) {
    console.error('Translation error:', error)
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'internalServerError') },
      { status: error.status || 500 }
    )
  }
})
