import { NextResponse } from 'next/server'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { UsageBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

/**
 * Billable quota is enforced AND recorded atomically server-side, inside each
 * billable AI route, via `checkAndRecordUsage()` (a single conditional UPDATE
 * that decrements the `*_quota` column only while it is > 0).
 *
 * This endpoint must therefore NOT decrement quota or insert `usage_records`
 * rows: the client calls it once per successful action, so any write here would
 * double-count every billable action (two usage rows, and a second column
 * decrement for paid users). It is kept as a lightweight, non-mutating
 * acknowledgement that lets the client trigger a quota refresh; the real gate
 * is the AI route, which returns 403 when the quota is exhausted.
 */
export const POST = withAuth(async (req) => {
  const locale = getRequestLocale(req)
  try {
    const parsed = await parseJson(req, UsageBody, locale, { errorKey: 'invalidUsageType' })
    if (!parsed.ok) return parsed.response
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('记录使用情况失败:', error instanceof Error ? (error.stack ?? error.message) : error)
    return NextResponse.json({ error: apiMsg(locale, 'recordUsageFailed') }, { status: 500 })
  }
})
