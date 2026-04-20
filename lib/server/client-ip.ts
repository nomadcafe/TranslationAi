/**
 * Extract the client IP for rate-limiting purposes.
 *
 * Vercel and most reverse proxies set `x-forwarded-for` with the real client
 * as the leftmost entry. Malicious clients can forge this header when hitting
 * the origin directly, but on a deployed Vercel app the edge overwrites it
 * before forwarding. For local dev the header may be absent and we fall back
 * to `x-real-ip` or a sentinel.
 *
 * Accepts both the Fetch API `Headers` class (used in route handlers) and the
 * plain object form NextAuth hands to `authorize()`.
 */
type HeadersLike = Headers | Record<string, string | string[] | undefined>

function read(h: HeadersLike, name: string): string | undefined {
  if (typeof (h as Headers).get === 'function') {
    const v = (h as Headers).get(name)
    return v ?? undefined
  }
  const obj = h as Record<string, string | string[] | undefined>
  const v = obj[name] ?? obj[name.toLowerCase()]
  if (Array.isArray(v)) return v[0]
  return v
}

export function getClientIp(headers: HeadersLike): string {
  const xff = read(headers, 'x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xrip = read(headers, 'x-real-ip')
  if (xrip) {
    const trimmed = xrip.trim()
    if (trimmed) return trimmed
  }
  return 'unknown'
}
