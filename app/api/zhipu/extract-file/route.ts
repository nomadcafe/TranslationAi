import { NextResponse } from 'next/server'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { zhipuExtractFileContent } from '@/lib/server/zhipu'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { ExtractFileBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'
import { checkRateLimit } from '@/lib/server/rate-limit'

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  try {
    const rateCheck = await checkRateLimit(auth.userId, 'default')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      )
    }

    const quota = await checkAndRecordUsage(auth.userId, 'pdf', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const parsed = await parseJson(request, ExtractFileBody, locale, { errorKey: 'missingBase64Data' })
    if (!parsed.ok) return parsed.response
    const { base64Data, mimeType } = parsed.data
    const mime = mimeType || 'application/octet-stream'

    const text = await zhipuExtractFileContent(base64Data.replace(/^data:.*?;base64,/, ''), mime, locale)
    return NextResponse.json({ text })
  } catch (error) {
    console.error(
      `[zhipu/extract-file] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { error: apiMsg(locale, 'fileRecognitionFailed') },
      { status: 500 },
    )
  }
})
