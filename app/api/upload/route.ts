import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { UploadBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'

const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_PREFIX = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/
const ALLOWED_VIDEO_PREFIX = /^data:video\/(mp4|webm);base64,/

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

    const validPrefix = type === 'video' ? ALLOWED_VIDEO_PREFIX.test(file) : ALLOWED_IMAGE_PREFIX.test(file)
    if (!validPrefix) {
      return NextResponse.json(
        { error: type === 'video' ? apiMsg(locale, 'uploadVideoFormatInvalid') : apiMsg(locale, 'uploadImageFormatInvalid') },
        { status: 400 }
      )
    }

    const base64Data = file.replace(/^data:.*?;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    if (buffer.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: apiMsg(locale, 'fileTooLarge') },
        { status: 413 }
      )
    }

    const ext = type === 'video' ? (file.includes('webm') ? 'webm' : 'mp4') : (file.includes('png') ? 'png' : file.includes('gif') ? 'gif' : file.includes('webp') ? 'webp' : 'jpg')
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
    const contentType = type === 'video' ? (file.includes('webm') ? 'video/webm' : 'video/mp4') : (file.includes('png') ? 'image/png' : file.includes('gif') ? 'image/gif' : file.includes('webp') ? 'image/webp' : 'image/jpeg')

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
