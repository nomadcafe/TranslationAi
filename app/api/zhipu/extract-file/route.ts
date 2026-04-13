import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/require-auth'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { zhipuExtractFileContent } from '@/lib/server/zhipu'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    const quota = await checkAndRecordUsage(auth.userId, 'pdf', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const { base64Data, mimeType } = await request.json()
    if (!base64Data) return NextResponse.json({ error: apiMsg(locale, 'missingBase64Data') }, { status: 400 })
    const mime = mimeType || 'application/octet-stream'

    const text = await zhipuExtractFileContent(base64Data.replace(/^data:.*?;base64,/, ''), mime, locale)
    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Z.AI extract file error:', error)
    return NextResponse.json({ error: error.message || apiMsg(locale, 'fileRecognitionFailed') }, { status: 500 })
  }
}
