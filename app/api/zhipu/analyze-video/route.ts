import { NextResponse } from 'next/server'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { zhipuAnalyzeVideo } from '@/lib/server/zhipu'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { FramesBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  try {
    const quota = await checkAndRecordUsage(auth.userId, 'video', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const parsed = await parseJson(request, FramesBody, locale, { errorKey: 'missingFrames' })
    if (!parsed.ok) return parsed.response
    const { frames } = parsed.data

    const text = await zhipuAnalyzeVideo(frames, locale)
    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Z.AI analyze video error:', error)
    return NextResponse.json({ error: error.message || apiMsg(locale, 'videoAnalysisFailed') }, { status: 500 })
  }
})
