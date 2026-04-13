import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth'
import {
  checkQuota,
  getUsageCount,
  recordUsage,
  isPaidUser,
  getUserIdAndStripePriceId
} from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

export async function POST(req: Request) {
  const locale = getRequestLocale(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    }

    const { type } = await req.json()
    if (!type || !['text', 'image', 'pdf', 'speech', 'video'].includes(type)) {
      return NextResponse.json({ error: apiMsg(locale, 'invalidUsageType') }, { status: 400 })
    }

    const user = await getUserIdAndStripePriceId(session.user.email)
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
}
