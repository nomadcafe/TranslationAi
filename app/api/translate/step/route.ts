import { NextResponse, after } from 'next/server'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { TranslateBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { saveTranslation } from '@/lib/server/translations'
import {
  openAICompatTranslate,
  isAbortError,
} from '@/lib/server/openai-compat-translate'

export const POST = withAuth(async (req, auth) => {
  const locale = getRequestLocale(req)
  const signal = req.signal
  try {
    const parsed = await parseJson(req, TranslateBody, locale)
    if (!parsed.ok) return parsed.response
    const { text, targetLanguage } = parsed.data

    const rateCheck = await checkRateLimit(auth.userId, 'translate')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      )
    }

    const systemContent =
      locale === 'zh'
        ? `你是专业译者。将下列文本翻译成 ${targetLanguage}，保持原有格式与风格。`
        : `You are a professional translator. Translate the following text to ${targetLanguage}. Keep the original format and style.`

    const result = await openAICompatTranslate(
      {
        apiKey: process.env.STEP_API_KEY,
        baseURL: 'https://api.stepfun.ai/v1',
        model: 'step-2-16k',
        systemPrompt: systemContent,
      },
      text,
      targetLanguage,
      signal,
    )

    if (result.text) {
      after(() =>
        saveTranslation({
          userId: auth.userId,
          sourceText: text,
          translatedText: result.text,
          targetLanguage,
          service: 'step',
        }),
      )
    }
    return NextResponse.json({ text: result.text, truncated: result.truncated })
  } catch (error) {
    if (isAbortError(error) || req.signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 })
    }
    console.error(
      `[translate/step] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { error: apiMsg(locale, 'translateFailed') },
      { status: 500 },
    )
  }
})
