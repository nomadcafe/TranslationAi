import { NextResponse } from 'next/server'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { ImageBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { isAbortError } from '@/lib/server/openai-compat-translate'

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  const signal = request.signal
  try {
    const rateCheck = await checkRateLimit(auth.userId, 'default')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      )
    }

    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'serviceNotConfigured') }, { status: 500 })

    const parsed = await parseJson(request, ImageBody, locale, { errorKey: 'missingImage' })
    if (!parsed.ok) return parsed.response
    const { image } = parsed.data

    const base64Data = image.replace(/^data:.*?;base64,/, '')
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const instruction =
      locale === 'zh'
        ? '请提取图片中的所有文字，以纯文本返回。尽量保持原有结构与版式；如有多语言请全部保留。'
        : 'Extract all text from this image as plain text. Preserve structure and layout. If multiple languages appear, keep them all.'

    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Data,
        },
      },
      instruction,
    ])
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const response = await result.response
    const text = response.text()
    return NextResponse.json({ text })
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 })
    }
    console.error(
      `[ocr/gemini] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { error: apiMsg(locale, 'ocrFailed') },
      { status: 500 },
    )
  }
})
