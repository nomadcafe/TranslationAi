import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { RegisterBody } from '@/lib/validation/schemas'
import { checkRateLimitByIp } from '@/lib/server/rate-limit'
import { getClientIp } from '@/lib/server/client-ip'
import { FREE_QUOTA } from '@/lib/quota-plans'

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

  const ip = getClientIp(req.headers)
  const rateCheck = await checkRateLimitByIp(ip, 'register')
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
    )
  }

  try {
    const raw = await req.json().catch(() => null)
    const parsed = RegisterBody.safeParse(raw)
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const path = firstIssue?.path[0]
      const key =
        path === 'email'
          ? 'emailInvalid'
          : path === 'password'
            ? 'passwordTooShort'
            : 'emailPasswordRequired'
      return NextResponse.json({ error: apiMsg(locale, key) }, { status: 400 })
    }
    const { email, password } = parsed.data

    const hashedPassword = await bcrypt.hash(password, 10)

    // Atomic insert: the UNIQUE(email) constraint is the authoritative guard, so
    // two concurrent registrations of the same email can't both succeed. An empty
    // result means the row already existed. Only select the columns we return —
    // never RETURNING * (which would pull password_hash into the handler).
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
        ${FREE_QUOTA.text_quota},
        ${FREE_QUOTA.image_quota},
        ${FREE_QUOTA.pdf_quota},
        ${FREE_QUOTA.speech_quota},
        ${FREE_QUOTA.video_quota}
      )
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email
    `

    if (result.length === 0) {
      return NextResponse.json(
        { error: apiMsg(locale, 'emailAlreadyRegistered') },
        { status: 400 }
      )
    }

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
  } catch (error) {
    console.error(
      '[register] error:',
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { error: apiMsg(locale, 'registerFailed') },
      { status: 500 }
    )
  }
}
