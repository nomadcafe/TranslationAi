import { NextResponse } from 'next/server'
import type { z, ZodTypeAny } from 'zod'
import { apiMsg, type AppLocale, type ApiMessageKey } from '@/lib/server/request-i18n'

type ErrorField = 'error' | 'message'

export type ParseOk<T> = { ok: true; data: T }
export type ParseFail = { ok: false; response: NextResponse }
export type ParseResult<T> = ParseOk<T> | ParseFail

function describeIssue(issue: z.ZodIssue): string {
  const path = issue.path.join('.') || '(body)'
  return `${path}: ${issue.message}`
}

function errorResponse(
  locale: AppLocale,
  errorKey: ApiMessageKey,
  errorField: ErrorField,
  detail?: string
): NextResponse {
  const body: Record<string, string> = {
    [errorField]: apiMsg(locale, errorKey),
  }
  if (detail && process.env.NODE_ENV !== 'production') {
    body.detail = detail
  }
  return NextResponse.json(body, { status: 400 })
}

export async function parseJson<S extends ZodTypeAny>(
  request: Request,
  schema: S,
  locale: AppLocale,
  opts: { errorKey?: ApiMessageKey; errorField?: ErrorField } = {}
): Promise<ParseResult<z.infer<S>>> {
  const errorKey = opts.errorKey ?? 'invalidRequestBody'
  const errorField = opts.errorField ?? 'error'

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return { ok: false, response: errorResponse(locale, errorKey, errorField, 'invalid JSON') }
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const detail = parsed.error.issues.map(describeIssue).join('; ')
    return { ok: false, response: errorResponse(locale, errorKey, errorField, detail) }
  }
  return { ok: true, data: parsed.data }
}

export function parseForm<S extends ZodTypeAny>(
  formData: FormData,
  schema: S,
  locale: AppLocale,
  opts: { errorKey?: ApiMessageKey; errorField?: ErrorField } = {}
): ParseResult<z.infer<S>> {
  const errorKey = opts.errorKey ?? 'invalidRequestBody'
  const errorField = opts.errorField ?? 'error'

  const raw: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    raw[key] = value
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const detail = parsed.error.issues.map(describeIssue).join('; ')
    return { ok: false, response: errorResponse(locale, errorKey, errorField, detail) }
  }
  return { ok: true, data: parsed.data }
}
