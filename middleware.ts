import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { APP_LOCALES, DEFAULT_PUBLIC_LOCALE, normalizeLocaleTag } from '@/lib/i18n/app-locale'
import { APP_LOCALE_COOKIE, APP_LOCALE_COOKIE_MAX_AGE } from '@/lib/i18n/locale-cookie'

const locales = new Set<string>(APP_LOCALES)
const defaultLocale = DEFAULT_PUBLIC_LOCALE

const BARE_LOCALIZED_PATHS = new Set([
  '/',
  '/pricing',
  '/privacy',
  '/translate',
  '/login',
  '/register',
  '/profile',
])

function readLocaleCookie(request: NextRequest): string | null {
  const v = request.cookies.get(APP_LOCALE_COOKIE)?.value
  return v && locales.has(v) ? v : null
}

function preferredLocale(request: NextRequest): string {
  const fromCookie = readLocaleCookie(request)
  if (fromCookie) return fromCookie

  const al = request.headers.get('accept-language') || ''
  const first = al.split(',')[0]?.split(';')[0]?.trim() || ''
  return normalizeLocaleTag(first) ?? defaultLocale
}

function withLocaleCookie(response: NextResponse, locale: string): NextResponse {
  if (locales.has(locale)) {
    response.cookies.set(APP_LOCALE_COOKIE, locale, {
      path: '/',
      maxAge: APP_LOCALE_COOKIE_MAX_AGE,
      sameSite: 'lax',
    })
  }
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    /\.[a-zA-Z0-9]+$/.test(pathname.split('/').pop() ?? '')
  ) {
    return NextResponse.next()
  }

  const segments = pathname.split('/').filter(Boolean)
  const first = segments[0]
  const maybeLocale = first && locales.has(first) ? first : null

  const requestHeaders = new Headers(request.headers)
  if (maybeLocale) {
    requestHeaders.set('x-next-locale', maybeLocale)
  }

  if (!maybeLocale && BARE_LOCALIZED_PATHS.has(pathname)) {
    const loc = preferredLocale(request)
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? `/${loc}` : `/${loc}${pathname}`
    return withLocaleCookie(NextResponse.redirect(url), loc)
  }

  const isProtectedProfile =
    maybeLocale !== null && segments.length >= 2 && segments[1] === 'profile'
  const isDashboard = pathname.startsWith('/dashboard')

  if (isProtectedProfile || isDashboard) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    })
    if (!token) {
      const loc = preferredLocale(request)
      const login = new URL(`/${loc}/login`, request.url)
      login.searchParams.set(
        'callbackUrl',
        `${pathname}${request.nextUrl.search}`
      )
      return NextResponse.redirect(login)
    }
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    return maybeLocale ? withLocaleCookie(res, maybeLocale) : res
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  return maybeLocale ? withLocaleCookie(res, maybeLocale) : res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
