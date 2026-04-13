import { neon } from '@neondatabase/serverless'
import type { AppLocale } from './request-i18n'
import { apiMsg } from './request-i18n'

let _sql: ReturnType<typeof neon> | null = null
function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _sql = neon(url)
  }
  return _sql
}

const monthlyPriceId = () => process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID
const yearlyPriceId = () => process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID

export function isPaidUser(stripePriceId: string | null) {
  return stripePriceId === monthlyPriceId() || stripePriceId === yearlyPriceId()
}

function getQuotasByPlan(stripePriceId: string | null) {
  if (stripePriceId === monthlyPriceId()) {
    return { text: -1, image: 50, pdf: 40, speech: 30, video: 10 }
  }
  if (stripePriceId === yearlyPriceId()) {
    return { text: -1, image: 100, pdf: 80, speech: 60, video: 20 }
  }
  return { text: -1, image: 5, pdf: 3, speech: 2, video: 1 }
}

export async function checkQuota(userId: number, type: string, locale: AppLocale = 'zh') {
  const quotaField = `${type}_quota`
  const sql = getSql()
  const result = (await sql`
    SELECT ${sql(quotaField)}, quota_reset_at, stripe_price_id
    FROM auth_users WHERE id = ${userId}
  `) as Record<string, unknown>[]
  if (result.length === 0) throw new Error(apiMsg(locale, 'userNotFound'))
  const user = result[0]
  const stripePriceId = (user.stripe_price_id as string | null | undefined) ?? null
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const paid = isPaidUser(stripePriceId)

  if (paid) {
    if (user.quota_reset_at !== today) {
      const quotas = getQuotasByPlan(stripePriceId)
      await getSql()`
        UPDATE auth_users
        SET image_quota = ${quotas.image}, pdf_quota = ${quotas.pdf},
            speech_quota = ${quotas.speech}, video_quota = ${quotas.video},
            quota_reset_at = ${today}
        WHERE id = ${userId}
      `
      return quotas[type as keyof typeof quotas]
    }
  } else {
    const resetAt = user.quota_reset_at ? new Date(user.quota_reset_at as string | Date) : null
    const isNewMonth = !resetAt || resetAt.getFullYear() !== now.getFullYear() || resetAt.getMonth() !== now.getMonth()
    if (isNewMonth) {
      const quotas = getQuotasByPlan(null)
      await getSql()`
        UPDATE auth_users
        SET image_quota = ${quotas.image}, pdf_quota = ${quotas.pdf},
            speech_quota = ${quotas.speech}, video_quota = ${quotas.video},
            quota_reset_at = ${firstDayOfMonth}
        WHERE id = ${userId}
      `
      return quotas[type as keyof typeof quotas]
    }
  }
  return user[quotaField] as number
}

async function getUsageCount(userId: number, type: string, stripePriceId: string | null) {
  const paid = isPaidUser(stripePriceId)
  if (paid) {
    const result = (await getSql()`
      SELECT COUNT(*) as count FROM usage_records
      WHERE user_id = ${userId} AND type = ${type} AND DATE(used_at) = CURRENT_DATE
    `) as { count: string }[]
    return parseInt(result[0].count, 10)
  }
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const result = (await getSql()`
    SELECT COUNT(*) as count FROM usage_records
    WHERE user_id = ${userId} AND type = ${type}
      AND used_at >= ${startOfMonth} AND used_at < ${startOfNextMonth}
  `) as { count: string }[]
  return parseInt(result[0].count, 10)
}

async function recordUsage(userId: number, type: string, stripePriceId: string | null) {
  await getSql()`INSERT INTO usage_records (user_id, type) VALUES (${userId}, ${type})`
  if (type === 'text' || !isPaidUser(stripePriceId)) return
  switch (type) {
    case 'image':
      await getSql()`UPDATE auth_users SET image_quota = GREATEST(image_quota - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`
      break
    case 'pdf':
      await getSql()`UPDATE auth_users SET pdf_quota = GREATEST(pdf_quota - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`
      break
    case 'speech':
      await getSql()`UPDATE auth_users SET speech_quota = GREATEST(speech_quota - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`
      break
    case 'video':
      await getSql()`UPDATE auth_users SET video_quota = GREATEST(video_quota - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`
      break
  }
}

export type QuotaType = 'image' | 'pdf' | 'speech' | 'video'

/**
 * Server-side quota check and decrement for billable API routes.
 * For type image/pdf/speech/video: checks and decrements; text is not decremented (caller handles auth).
 */
export async function checkAndRecordUsage(
  userId: number,
  type: QuotaType,
  locale: AppLocale = 'zh'
): Promise<{ allowed: boolean; error?: string }> {
  const rows = (await getSql()`SELECT stripe_price_id FROM auth_users WHERE id = ${userId}`) as {
    stripe_price_id: string | null
  }[]
  if (rows.length === 0) return { allowed: false, error: apiMsg(locale, 'userNotFound') }
  const stripePriceId = rows[0].stripe_price_id ?? null

  const quota = await checkQuota(userId, type, locale)
  const usageCount = await getUsageCount(userId, type, stripePriceId)
  const remaining = quota - usageCount

  if (remaining <= 0) {
    return {
      allowed: false,
      error: isPaidUser(stripePriceId) ? apiMsg(locale, 'quotaDailyExceeded') : apiMsg(locale, 'quotaMonthlyExceeded')
    }
  }

  await recordUsage(userId, type, stripePriceId)
  return { allowed: true }
}

export async function getUserIdAndStripePriceId(email: string): Promise<{ id: number; stripe_price_id: string | null } | null> {
  const rows = (await getSql()`SELECT id, stripe_price_id FROM auth_users WHERE email = ${email}`) as {
    id: number
    stripe_price_id: string | null
  }[]
  if (rows.length === 0) return null
  return { id: rows[0].id, stripe_price_id: rows[0].stripe_price_id ?? null }
}

// Re-exported for user/usage routes.
export { getUsageCount, recordUsage, getQuotasByPlan }
