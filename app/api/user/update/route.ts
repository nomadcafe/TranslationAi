import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { authOptions } from '../../auth/[...nextauth]/auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

export async function PUT(req: Request) {
  const locale = getRequestLocale(req)
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ message: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    }

    const body = await req.json()
    const { name } = body

    if (typeof name !== 'string' || name.length > 50) {
      return NextResponse.json({ message: apiMsg(locale, 'invalidDisplayName') }, { status: 400 })
    }

    const sql = neon(process.env.DATABASE_URL!)
    
    await sql`
      UPDATE auth_users
      SET name = ${name}, updated_at = CURRENT_TIMESTAMP
      WHERE email = ${session.user.email}
    `

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Failed to update user:', error)
    return NextResponse.json({ message: apiMsg(locale, 'updateProfileFailed') }, { status: 500 })
  }
}
