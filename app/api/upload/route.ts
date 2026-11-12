import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { UploadBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_PREFIX = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/
const ALLOWED_VIDEO_PREFIX = /^data:video\/(mp4|webm);base64,/
const SUBTYPE_EXT: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', mp4: 'mp4', webm: 'webm' }

export const POST = withAuth(async (request) => {
  const locale = getRequestLocale(request)
  try {
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: apiMsg(locale, 'bodyTooLarge') },
        { status: 413 }
      )
    }

    const parsed = await parseJson(request, UploadBody, locale, { errorKey: 'fileNotProvided' })
    if (!parsed.ok) return parsed.response
    const { file, type } = parsed.data

    // Derive the media type only from the validated data-URL prefix; matching
    // against the whole string would hit random substrings in the base64 payload.
    const prefixMatch = (type === 'video' ? ALLOWED_VIDEO_PREFIX : ALLOWED_IMAGE_PREFIX).exec(file)
    if (!prefixMatch) {
      return NextResponse.json(
        { error: type === 'video' ? apiMsg(locale, 'uploadVideoFormatInvalid') : apiMsg(locale, 'uploadImageFormatInvalid') },
        { status: 400 }
      )
    }

    const base64Data = file.slice(prefixMatch[0].length)
    const buffer = Buffer.from(base64Data, 'base64')
    if (buffer.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: apiMsg(locale, 'fileTooLarge') },
        { status: 413 }
      )
    }

    const subtype = prefixMatch[1]
    const ext = SUBTYPE_EXT[subtype]
    const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`
    const contentType = `${type === 'video' ? 'video' : 'image'}/${subtype === 'jpg' ? 'jpeg' : subtype}`

    const blob = await put(filename, buffer, {
      access: 'public',
      contentType
    })

    return NextResponse.json({ url: blob.url })
  } catch (error: any) {
    console.error('文件上传错误:', error)
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'fileUploadFailed') },
      { status: 500 }
    )
  }
})
