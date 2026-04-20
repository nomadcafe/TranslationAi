import { NextResponse } from 'next/server'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { qwenChatCompletionsUrl } from '@/lib/server/qwen-api-base'
import { parseJson } from '@/lib/server/validate'
import { ImageBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { isAbortError } from '@/lib/server/openai-compat-translate'

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  const signal = request.signal
  try {
    if (!process.env.QWEN_API_KEY?.trim()) {
      return NextResponse.json({ message: apiMsg(locale, 'serviceNotConfigured') }, { status: 503 })
    }

    const rateCheck = await checkRateLimit(auth.userId, 'default')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { message: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      )
    }

    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ message: quota.error }, { status: 403 })

    const parsed = await parseJson(request, ImageBody, locale, {
      errorKey: 'missingImageData',
      errorField: 'message',
    })
    if (!parsed.ok) return parsed.response
    const { image } = parsed.data

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
      }),
      signal,
    })

    if (!response.ok) {
      // Read and discard body so server log has the raw reason without
      // leaking it to the client.
      const body = await response.text().catch(() => '')
      console.error(
        `[ocr/qwen] userId=${auth.userId} upstream ${response.status}:`,
        body.slice(0, 500),
      )
      throw new Error('upstream')
    }

    const result = await response.json()
    const text = result.choices[0].message.content
    return NextResponse.json({ text })
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return NextResponse.json({ message: 'aborted' }, { status: 499 })
    }
    console.error(
      `[ocr/qwen] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { message: apiMsg(locale, 'ocrGenericFailed') },
      { status: 500 }
    )
  }
}, { errorField: 'message' })
