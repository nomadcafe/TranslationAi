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
const MAX_ENTRIES = 10_000
const CLEANUP_EVERY = 500 // Sweep expired entries every N calls to cap memory.

let callsSinceCleanup = 0

const LIMITS: Record<string, number> = {
  translate: 30, // 30 translations per user per minute
  default: 60,
}

function sweep(now: number) {
  for (const [key, win] of windows) {
    if (now >= win.resetAt) windows.delete(key)
  }
  // Hard cap: evict oldest entries if still over the threshold.
  if (windows.size > MAX_ENTRIES) {
    const sorted = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt)
    const toEvict = windows.size - MAX_ENTRIES
    for (let i = 0; i < toEvict; i++) windows.delete(sorted[i][0])
  }
}

export function checkRateLimit(
  userId: number,
  endpoint = 'default'
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
