import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { UpdateUserBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

export const PUT = withAuth(async (req, auth) => {
  const locale = getRequestLocale(req)
  try {
    const parsed = await parseJson(req, UpdateUserBody, locale, {
      errorKey: 'invalidDisplayName',
      errorField: 'message',
    })
    if (!parsed.ok) return parsed.response
    const { name } = parsed.data

    const sql = neon(process.env.DATABASE_URL!)

    await sql`
      UPDATE auth_users
      SET name = ${name}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${auth.userId}
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Failed to update user:', error)
    return NextResponse.json({ message: apiMsg(locale, 'updateProfileFailed') }, { status: 500 })
  }
}, { errorField: 'message' })
