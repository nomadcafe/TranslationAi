import { NextResponse } from 'next/server'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { zhipuImageOcr } from '@/lib/server/zhipu'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { ImageBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  try {
    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 })

    const parsed = await parseJson(request, ImageBody, locale, { errorKey: 'missingImage' })
    if (!parsed.ok) return parsed.response
    const { image } = parsed.data

    const text = await zhipuImageOcr(image, locale)
    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Z.AI OCR error:', error)
    return NextResponse.json({ error: error.message || apiMsg(locale, 'ocrFailed') }, { status: 500 })
  }
})
