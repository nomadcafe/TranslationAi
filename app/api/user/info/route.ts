import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { withAuth } from '@/lib/server/with-auth'
import { FREE_QUOTA, getQuotasByPriceId } from '@/lib/quota-plans'

interface User {
  id: string;
  email: string;
  name: string | null;
  github_id: string | null;
  google_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_current_period_end: string | null;
  text_quota: number;
  image_quota: number;
  pdf_quota: number;
  speech_quota: number;
  video_quota: number;
  quota_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

type UsageType = 'text' | 'image' | 'pdf' | 'speech' | 'video';

interface UsageRecord {
  type: UsageType;
  count: string;
}

interface UsageInfo {
  [key: string]: number;
  text: number;
  image: number;
  pdf: number;
  speech: number;
  video: number;
}

export const GET = withAuth(async (_req, auth) => {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    // Load profile + Stripe subscription snapshot.
    const users = await sql`
      SELECT
        id,
        email,
        name,
        github_id,
        google_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        stripe_current_period_end,
        text_quota,
        image_quota,
        pdf_quota,
        speech_quota,
        video_quota,
        quota_reset_at,
        created_at,
        updated_at
      FROM auth_users
      WHERE id = ${auth.userId}
    ` as User[]

    if (!users.length) {
      console.log('未找到用户记录')
      return new NextResponse('User not found', { status: 404 })
    }

    const user = users[0]
    console.log('查询到的用户信息:', {
      id: user.id,
      email: user.email,
      subscription: {
        customerId: user.stripe_customer_id,
        subscriptionId: user.stripe_subscription_id,
        priceId: user.stripe_price_id,
        currentPeriodEnd: user.stripe_current_period_end
      },
      quotas: {
        text: user.text_quota,
        image: user.image_quota,
        pdf: user.pdf_quota,
        speech: user.speech_quota,
        video: user.video_quota
      }
    })

    // Treat ended/canceled subs as inactive.
    if (user.stripe_current_period_end) {
      const currentPeriodEnd = new Date(user.stripe_current_period_end).getTime()
      const now = new Date().getTime()
      
      if (now > currentPeriodEnd) {
        console.log('订阅已过期，重置为试用版（按月配额）')
        const firstDay = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
        const q = FREE_QUOTA
        await sql`
          UPDATE auth_users
          SET stripe_subscription_id = NULL, stripe_price_id = NULL, stripe_current_period_end = NULL,
              text_quota = ${q.text_quota}, image_quota = ${q.image_quota}, pdf_quota = ${q.pdf_quota},
              speech_quota = ${q.speech_quota}, video_quota = ${q.video_quota},
              quota_reset_at = ${firstDay}
          WHERE id = ${user.id}
        `
        user.stripe_subscription_id = null
        user.stripe_price_id = null
        user.stripe_current_period_end = null
        Object.assign(user, q)
        user.quota_reset_at = firstDay
      }
    }

    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const isPaid = user.stripe_price_id === process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID ||
      user.stripe_price_id === process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID

    // Paid: daily reset; free: monthly reset window. Quota numbers come from the
    // single source of truth (lib/quota-plans). The `IS DISTINCT FROM` guard makes
    // the reset idempotent under concurrent requests for the same user.
    if (isPaid) {
      if (user.quota_reset_at !== today) {
        const q = getQuotasByPriceId(
          user.stripe_price_id,
          process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID,
          process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID,
        )
        await sql`
          UPDATE auth_users SET image_quota = ${q.image_quota}, pdf_quota = ${q.pdf_quota},
            speech_quota = ${q.speech_quota}, video_quota = ${q.video_quota}, quota_reset_at = ${today}
          WHERE id = ${user.id} AND quota_reset_at IS DISTINCT FROM ${today}
        `
        Object.assign(user, q)
      }
    } else {
      const resetAt = user.quota_reset_at ? new Date(user.quota_reset_at) : null
      const isNewMonth = !resetAt || resetAt.getFullYear() !== now.getFullYear() || resetAt.getMonth() !== now.getMonth()
      if (isNewMonth) {
        const q = FREE_QUOTA
        await sql`
          UPDATE auth_users SET image_quota = ${q.image_quota}, pdf_quota = ${q.pdf_quota},
            speech_quota = ${q.speech_quota}, video_quota = ${q.video_quota}, quota_reset_at = ${firstDayOfMonth}
          WHERE id = ${user.id} AND quota_reset_at IS DISTINCT FROM ${firstDayOfMonth}
        `
        Object.assign(user, q)
      }
    }

    // Usage counts scoped to today (paid) vs current month (free).
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
    const usage = isPaid
      ? await sql`
          SELECT type, COUNT(*) as count FROM usage_records
          WHERE user_id = ${user.id} AND DATE(used_at) = CURRENT_DATE
          GROUP BY type
        ` as UsageRecord[]
      : await sql`
          SELECT type, COUNT(*) as count FROM usage_records
          WHERE user_id = ${user.id} AND used_at >= ${startOfMonth} AND used_at < ${startOfNextMonth}
          GROUP BY type
        ` as UsageRecord[]

    console.log('今日使用记录:', usage)

    // Shape JSON for the client dashboard.
    const response = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        github_id: user.github_id,
        google_id: user.google_id,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      subscription: {
        // stripe_customer_id and stripe_subscription_id are server-only internals.
        stripe_price_id: user.stripe_price_id,
        stripe_current_period_end: user.stripe_current_period_end
      },
      quota_period: isPaid ? 'day' : 'month',
      quota: {
        text_quota: user.text_quota,
        image_quota: user.image_quota,
        pdf_quota: user.pdf_quota,
        speech_quota: user.speech_quota,
        video_quota: user.video_quota
      },
      usage: {
        text: 0,
        image: 0,
        pdf: 0,
        speech: 0,
        video: 0
      } as UsageInfo
    }

    // Attach per-feature usage tallies.
    usage.forEach((record) => {
      response.usage[record.type] = parseInt(record.count)
    })

    console.log('返回的用户信息:', response)
    return NextResponse.json(response)
  } catch (error) {
    console.error('获取用户信息失败:', error)
    return new NextResponse('Internal error', { status: 500 })
  }
})
