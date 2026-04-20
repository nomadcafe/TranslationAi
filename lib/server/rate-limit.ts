/**
 * Rate limiter with two backends:
 *
 *  - Upstash Redis (preferred) when `UPSTASH_REDIS_REST_URL` and
 *    `UPSTASH_REDIS_REST_TOKEN` are set. Counts are shared across serverless
 *    containers and regions — this is the only configuration that actually
 *    enforces limits in production.
 *  - In-process sliding window (fallback). Module-level state is shared within
 *    one serverless container but not across containers; on cold starts and
 *    under horizontal scaling it is effectively bypassed. Suitable only for
 *    local dev or as a soft floor.
 *
 * The function is async so callers contract works regardless of backend. On
 * Upstash failures we fail open — rejecting every request on a transient Redis
 * outage would self-DoS — but the error is logged for operators.
 */
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const WINDOW_MS = 60_000
const MAX_ENTRIES = 10_000
const CLEANUP_EVERY = 500

const LIMITS: Record<string, number> = {
  translate: 30, // 30 translations per user per minute
  default: 60,
}

// --- Upstash backend (only built if env is present) -------------------------

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

const upstashLimiters: Record<string, Ratelimit> | null =
  upstashUrl && upstashToken
    ? (() => {
        const redis = new Redis({ url: upstashUrl, token: upstashToken })
        const out: Record<string, Ratelimit> = {}
        for (const [endpoint, limit] of Object.entries(LIMITS)) {
          out[endpoint] = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(limit, '60 s'),
            prefix: `rl:${endpoint}`,
            analytics: false,
          })
        }
        return out
      })()
    : null

if (!upstashLimiters && process.env.NODE_ENV === 'production') {
  console.warn(
    '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — ' +
      'falling back to in-process limiter. Per-container state means limits ' +
      'will leak across serverless instances; set Upstash env vars to enforce.',
  )
}

// --- In-process backend (fallback) ------------------------------------------

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()
let callsSinceCleanup = 0

function sweep(now: number) {
  for (const [key, win] of windows) {
    if (now >= win.resetAt) windows.delete(key)
  }
  if (windows.size > MAX_ENTRIES) {
    const sorted = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    const toEvict = windows.size - MAX_ENTRIES
    for (let i = 0; i < toEvict; i++) windows.delete(sorted[i][0])
  }
}

function inProcessCheck(
  userId: number,
  endpoint: string,
): { allowed: boolean; retryAfter?: number } {
  const limit = LIMITS[endpoint] ?? LIMITS.default
  const key = `${userId}:${endpoint}`
  const now = Date.now()

  callsSinceCleanup++
  if (callsSinceCleanup >= CLEANUP_EVERY) {
    callsSinceCleanup = 0
    sweep(now)
  }

  const win = windows.get(key)
  if (!win || now >= win.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true }
  }

  if (win.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((win.resetAt - now) / 1000) }
  }

  win.count++
  return { allowed: true }
}

// --- Public API -------------------------------------------------------------

export async function checkRateLimit(
  userId: number,
  endpoint = 'default',
): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (upstashLimiters) {
    const limiter = upstashLimiters[endpoint] ?? upstashLimiters.default
    try {
      const res = await limiter.limit(`u:${userId}`)
      if (res.success) return { allowed: true }
      const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000))
      return { allowed: false, retryAfter }
    } catch (err) {
      // Fail open on Redis outage — better to serve briefly unlimited than to
      // take the whole app down. The spike is also recorded server-side.
      console.error(
        '[rate-limit] Upstash error, failing open:',
        err instanceof Error ? err.message : err,
      )
      return { allowed: true }
    }
  }
  return inProcessCheck(userId, endpoint)
}
