/**
 * Canonical site origin (no trailing slash).
 * Set NEXT_PUBLIC_APP_URL in production to match the live domain (same as metadataBase / sitemap / robots).
 *
 * Multilingual SEO: UI i18n is client-side on the same paths, so crawlers see one URL per page.
 * Public app routes use locale prefixes (`/en`, `/zh`, …) including `/translate`; sitemap lists each locale.
 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (raw) {
    try {
      return new URL(raw).origin
    } catch {
      return raw.replace(/\/$/, '')
    }
  }
  return 'https://translation.ai'
}
