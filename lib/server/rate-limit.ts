/**
 * In-process sliding-window rate limiter.
 *
 * State is module-level, so it is shared across requests within the same
 * serverless function container but NOT across containers. This is sufficient
 * protection against accidental hammering and casual abuse.
 *
 * For strict distributed rate limiting (multi-region), replace with
 * Upstash Redis + @upstash/ratelimit.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

const WINDOW_MS = 60_000

const LIMITS: Record<string, number> = {
  translate: 30,   // 30 translations per user per minute
  default: 60,
}

export function checkRateLimit(
  userId: number,
  endpoint = 'default'
): { allowed: boolean; retryAfter?: number } {
  const limit = LIMITS[endpoint] ?? LIMITS.default
  const key = `${userId}:${endpoint}`
  const now = Date.now()
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
