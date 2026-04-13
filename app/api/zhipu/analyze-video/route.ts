import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/require-auth'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { zhipuAnalyzeVideo } from '@/lib/server/zhipu'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    const quota = await checkAndRecordUsage(auth.userId, 'video', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const { frames } = await request.json()
    if (!Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: apiMsg(locale, 'missingFrames') }, { status: 400 })
    }

    const text = await zhipuAnalyzeVideo(frames, locale)
    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Z.AI analyze video error:', error)
    return NextResponse.json({ error: error.message || apiMsg(locale, 'videoAnalysisFailed') }, { status: 500 })
  }
}
