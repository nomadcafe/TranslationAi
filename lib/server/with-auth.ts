import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/require-auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

export type AuthContext = { userId: number; email: string }

type RouteContext = { params: Promise<Record<string, string | string[]>> }

type AuthedHandler = (
  req: Request,
  auth: AuthContext,
  ctx: RouteContext
) => Promise<Response> | Response

export interface WithAuthOptions {
  errorField?: 'error' | 'message'
}

/**
 * Wrap a Next.js route handler so it only runs after auth succeeds.
 *
 * The wrapper replaces the per-route `const auth = await requireAuth(); if (!auth) return 401`
 * boilerplate. Forgetting the wrapper is visually obvious at the `export` line,
 * which is easier to review than a missing early-return inside a handler body.
 */
export function withAuth(
  handler: AuthedHandler,
  opts: WithAuthOptions = {}
): (req: Request, ctx: RouteContext) => Promise<Response> {
  const errorField = opts.errorField ?? 'error'
  return async (req, ctx) => {
    const auth = await requireAuth()
    if (!auth) {
      const locale = getRequestLocale(req)
      return NextResponse.json(
        { [errorField]: apiMsg(locale, 'unauthenticated') },
        { status: 401 }
      )
    }
    return handler(req, auth, ctx)
  }
}
