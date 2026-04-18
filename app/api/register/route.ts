import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

const databaseUrl = process.env.DATABASE_URL?.trim()
const sql = databaseUrl ? neon(databaseUrl) : null

export async function POST(req: Request) {
  const locale = getRequestLocale(req)
  if (!sql) {
    console.error('Register: DATABASE_URL not configured')
    return NextResponse.json(
      { error: apiMsg(locale, 'serviceNotConfigured') },
      { status: 503 }
    )
  }

  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: apiMsg(locale, 'emailPasswordRequired') },
        { status: 400 }
      )
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: apiMsg(locale, 'emailInvalid') },
        { status: 400 }
      )
    }

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: apiMsg(locale, 'passwordTooShort') },
        { status: 400 }
      )
    }

    const existingUser = await sql`SELECT id FROM auth_users WHERE email = ${email}`
    if (existingUser.length > 0) {
      return NextResponse.json(
        { error: apiMsg(locale, 'emailAlreadyRegistered') },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const result = await sql`
      INSERT INTO auth_users (
        email, 
        password_hash,
        text_quota,
        image_quota,
        pdf_quota,
        speech_quota,
        video_quota
      )
      VALUES (
        ${email}, 
        ${hashedPassword},
        -1,
        5,
        3,
        2,
        1
      )
      RETURNING *
    `

    return NextResponse.json(
      { 
        message: apiMsg(locale, 'registerSuccess'),
        user: {
          id: result[0].id,
          email: result[0].email
        }
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Register error:', error?.message ?? error)
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'registerFailed') },
      { status: 500 }
    )
  }
}
