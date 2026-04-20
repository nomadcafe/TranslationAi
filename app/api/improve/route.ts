import { NextResponse } from 'next/server'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { TranslateTargetLangBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { isAbortError } from '@/lib/server/openai-compat-translate'

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  const signal = request.signal
  try {
    const rateCheck = await checkRateLimit(auth.userId, 'translate')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      )
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'serviceNotConfigured') }, { status: 500 })

    const parsed = await parseJson(request, TranslateTargetLangBody, locale, { errorKey: 'missingTextOrTargetLang' })
    if (!parsed.ok) return parsed.response
    const { text, targetLang } = parsed.data

    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt =
      locale === 'zh'
        ? `请对以下${targetLang}文本进行润色，使其更加流畅自然。

原文：
${text}

要求：
- 直接返回润色后的文本
- 不要添加任何解释或说明
- 保持段落和换行格式
- 保持标点符号的使用`
        : `Polish the following ${targetLang} text so it reads more fluent and natural.

Original:
${text}

Rules:
- Return only the polished text
- No explanations
- Preserve paragraphs and line breaks
- Preserve punctuation habits`

    // Gemini SDK (v0.x) lacks AbortSignal support; best-effort pre-check.
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 0.1,
        maxOutputTokens: 8000,
      },
    })
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const response = await result.response
    const improved = response.text()
    const truncated = response.candidates?.[0]?.finishReason === 'MAX_TOKENS'
    return NextResponse.json({ text: improved, truncated })
  } catch (error) {
    if (isAbortError(error) || request.signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 })
    }
    console.error(
      `[improve] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { error: apiMsg(locale, 'improveFailed') },
      { status: 500 },
    )
  }
})
