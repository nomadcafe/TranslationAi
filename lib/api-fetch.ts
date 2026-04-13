import { getClientAppLocale } from '@/lib/i18n/client-locale'

/** fetch() that sends X-App-Locale so API errors and prompts match UI language. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? undefined)
  if (!headers.has('X-App-Locale')) {
    headers.set('X-App-Locale', getClientAppLocale())
  }
  return fetch(input, { ...init, headers })
}
