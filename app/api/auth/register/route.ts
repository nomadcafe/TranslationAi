import { NextResponse } from 'next/server'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

/** Legacy path; real sign-up uses `POST /api/register` (`auth_users`). */
export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  return NextResponse.json({ message: apiMsg(locale, 'legacyRegisterDisabled') }, { status: 410 })
}
