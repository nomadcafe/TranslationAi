import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/with-auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { listTranslations } from '@/lib/server/translations'
import { TranslationListQuery } from '@/lib/validation/schemas'

export const GET = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  const url = new URL(request.url)
  const raw = Object.fromEntries(url.searchParams.entries())
  const parsed = TranslationListQuery.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: apiMsg(locale, 'invalidRequestBody') },
      { status: 400 }
    )
  }

  try {
    const { q, favorite, cursor, limit } = parsed.data
    const result = await listTranslations({
      userId: auth.userId,
      search: q,
      favoriteOnly: favorite === '1' || favorite === 'true',
      beforeId: cursor,
      limit,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[translations] list failed:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: apiMsg(locale, 'internalServerError') },
      { status: 500 }
    )
  }
})
