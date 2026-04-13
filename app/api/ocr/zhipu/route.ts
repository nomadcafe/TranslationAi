import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/require-auth'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { zhipuImageOcr } from '@/lib/server/zhipu'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const { image } = await request.json()
    if (!image) return NextResponse.json({ error: apiMsg(locale, 'missingImage') }, { status: 400 })

    const text = await zhipuImageOcr(typeof image === 'string' ? image : image.toString(), locale)
    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Z.AI OCR error:', error)
    return NextResponse.json({ error: error.message || apiMsg(locale, 'ocrFailed') }, { status: 500 })
  }
}
