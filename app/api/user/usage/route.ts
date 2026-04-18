import { NextResponse } from 'next/server'
import {
  checkQuota,
  getUsageCount,
  recordUsage,
  isPaidUser,
  getUserIdAndStripePriceId
} from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { UsageBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

export const POST = withAuth(async (req, auth) => {
  const locale = getRequestLocale(req)
  try {
    const parsed = await parseJson(req, UsageBody, locale, { errorKey: 'invalidUsageType' })
    if (!parsed.ok) return parsed.response
    const { type } = parsed.data

    const user = await getUserIdAndStripePriceId(auth.email)
    if (!user) {
      return NextResponse.json({ error: apiMsg(locale, 'userNotFound') }, { status: 404 })
    }

    const { id: userId, stripe_price_id: stripePriceId } = user
    const quota = await checkQuota(userId, type, locale)
    const usageCount = await getUsageCount(userId, type, stripePriceId)

    if (quota === -1) {
      await recordUsage(userId, type, stripePriceId)
      return NextResponse.json({ success: true, remaining: -1 })
    }

    const remainingQuota = quota - usageCount
    const isFree = !isPaidUser(stripePriceId)
    if (remainingQuota <= 0) {
      return NextResponse.json(
        { error: isFree ? apiMsg(locale, 'quotaMonthlyExceeded') : apiMsg(locale, 'quotaDailyExceeded') },
        { status: 403 }
      )
    }

    await recordUsage(userId, type, stripePriceId)
    return NextResponse.json({ success: true, remaining: remainingQuota - 1 })
  } catch (error: any) {
    console.error('记录使用情况失败:', error)
    return NextResponse.json({ error: error.message || apiMsg(locale, 'recordUsageFailed') }, { status: 500 })
  }
})
