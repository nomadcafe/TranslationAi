import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/with-auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { TranslationPatchBody } from '@/lib/validation/schemas'
import { setFavorite, removeTranslation } from '@/lib/server/translations'

function parseId(raw: string | string[] | undefined): number | null {
  const val = Array.isArray(raw) ? raw[0] : raw
  if (!val) return null
  const n = parseInt(val, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export const PATCH = withAuth(async (request, auth, ctx) => {
  const locale = getRequestLocale(request)
  const params = await ctx.params
  const id = parseId(params.id)
  if (!id) {
    return NextResponse.json({ error: apiMsg(locale, 'invalidRequestBody') }, { status: 400 })
  }

  const parsed = await parseJson(request, TranslationPatchBody, locale)
  if (!parsed.ok) return parsed.response

  try {
    const ok = await setFavorite(auth.userId, id, parsed.data.isFavorite)
    if (!ok) {
      return NextResponse.json({ error: apiMsg(locale, 'userNotFound') }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[translations] patch failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: apiMsg(locale, 'internalServerError') }, { status: 500 })
  }
})

export const DELETE = withAuth(async (request, auth, ctx) => {
  const locale = getRequestLocale(request)
  const params = await ctx.params
  const id = parseId(params.id)
  if (!id) {
    return NextResponse.json({ error: apiMsg(locale, 'invalidRequestBody') }, { status: 400 })
  }

  try {
    const ok = await removeTranslation(auth.userId, id)
    if (!ok) {
      return NextResponse.json({ error: apiMsg(locale, 'userNotFound') }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[translations] delete failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: apiMsg(locale, 'internalServerError') }, { status: 500 })
  }
})
