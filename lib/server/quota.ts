import { neon } from '@neondatabase/serverless'
import type { AppLocale } from './request-i18n'
import { apiMsg } from './request-i18n'
import { FREE_QUOTA, MONTHLY_QUOTA, YEARLY_QUOTA } from '@/lib/quota-plans'

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

export function getQuotasByPlan(stripePriceId: string | null) {
  if (stripePriceId === monthlyPriceId()) return MONTHLY_QUOTA
  if (stripePriceId === yearlyPriceId()) return YEARLY_QUOTA
  return FREE_QUOTA
}

export type QuotaType = 'image' | 'pdf' | 'speech' | 'video'

/**
 * Atomically gate and record a billable action.
 *
 * The decrement is performed with a single conditional UPDATE so that two
 * concurrent requests cannot both see "remaining = 1" and both succeed –
 * only one UPDATE will match the `quota > 0` predicate.
 */
export async function checkAndRecordUsage(
  userId: number,
  type: QuotaType,
  locale: AppLocale = 'zh'
): Promise<{ allowed: boolean; error?: string }> {
  const sql = getSql()

  // Fetch user state in one query.
  const rows = (await sql`
    SELECT stripe_price_id, image_quota, pdf_quota, speech_quota, video_quota, quota_reset_at
    FROM auth_users WHERE id = ${userId}
  `) as {
    stripe_price_id: string | null
    image_quota: number
    pdf_quota: number
    speech_quota: number
    video_quota: number
    quota_reset_at: string | null
  }[]

  if (rows.length === 0) return { allowed: false, error: apiMsg(locale, 'userNotFound') }

  const user = rows[0]
  const stripePriceId = user.stripe_price_id ?? null
  const paid = isPaidUser(stripePriceId)
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // Reset quota if the billing period has rolled over.
  // Using IS DISTINCT FROM to make the UPDATE idempotent under concurrent resets.
  if (paid && user.quota_reset_at !== today) {
    const q = getQuotasByPlan(stripePriceId)
    await sql`
      UPDATE auth_users
      SET image_quota = ${q.image_quota}, pdf_quota = ${q.pdf_quota},
          speech_quota = ${q.speech_quota}, video_quota = ${q.video_quota},
          quota_reset_at = ${today}
      WHERE id = ${userId} AND quota_reset_at IS DISTINCT FROM ${today}
    `
  } else if (!paid) {
    const resetAt = user.quota_reset_at ? new Date(user.quota_reset_at) : null
    const isNewMonth =
      !resetAt ||
      resetAt.getFullYear() !== now.getFullYear() ||
      resetAt.getMonth() !== now.getMonth()
    if (isNewMonth) {
      const q = getQuotasByPlan(null)
      await sql`
        UPDATE auth_users
        SET image_quota = ${q.image_quota}, pdf_quota = ${q.pdf_quota},
            speech_quota = ${q.speech_quota}, video_quota = ${q.video_quota},
            quota_reset_at = ${firstDayOfMonth}
        WHERE id = ${userId} AND quota_reset_at IS DISTINCT FROM ${firstDayOfMonth}
      `
    }
  }

  // Atomically decrement: succeeds only when the quota column is still > 0.
  // This eliminates the TOCTOU race between reading remaining and recording usage.
  let decremented: { id: number }[] = []
  switch (type) {
    case 'image':
      decremented = (await sql`
        UPDATE auth_users SET image_quota = image_quota - 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId} AND image_quota > 0 RETURNING id
      `) as { id: number }[]
      break
    case 'pdf':
      decremented = (await sql`
        UPDATE auth_users SET pdf_quota = pdf_quota - 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId} AND pdf_quota > 0 RETURNING id
      `) as { id: number }[]
      break
    case 'speech':
      decremented = (await sql`
        UPDATE auth_users SET speech_quota = speech_quota - 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId} AND speech_quota > 0 RETURNING id
      `) as { id: number }[]
      break
    case 'video':
      decremented = (await sql`
        UPDATE auth_users SET video_quota = video_quota - 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId} AND video_quota > 0 RETURNING id
      `) as { id: number }[]
      break
  }

  if (decremented.length === 0) {
    return {
      allowed: false,
      error: paid
        ? apiMsg(locale, 'quotaDailyExceeded')
        : apiMsg(locale, 'quotaMonthlyExceeded'),
    }
  }

  // Insert into usage_records for history and reporting.
  await sql`INSERT INTO usage_records (user_id, type) VALUES (${userId}, ${type})`

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
