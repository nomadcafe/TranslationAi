import { NextResponse } from 'next/server'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { zhipuAnalyzeVideo } from '@/lib/server/zhipu'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { FramesBody } from '@/lib/validation/schemas'
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

    const quota = await checkAndRecordUsage(auth.userId, 'video', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const parsed = await parseJson(request, FramesBody, locale, { errorKey: 'missingFrames' })
    if (!parsed.ok) return parsed.response
    const { frames } = parsed.data

    const text = await zhipuAnalyzeVideo(frames, locale)
    return NextResponse.json({ text })
  } catch (error) {
    console.error(
      `[zhipu/analyze-video] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { error: apiMsg(locale, 'videoAnalysisFailed') },
      { status: 500 },
    )
  }
})
