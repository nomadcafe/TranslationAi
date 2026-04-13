import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { requireAuth } from '@/lib/server/require-auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

const MAX_BODY_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_IMAGE_PREFIX = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/
const ALLOWED_VIDEO_PREFIX = /^data:video\/(mp4|webm);base64,/

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })

    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: apiMsg(locale, 'bodyTooLarge') },
        { status: 413 }
      )
    }

    const { file, type } = await request.json()

    if (!file || typeof file !== 'string') {
      return NextResponse.json(
        { error: apiMsg(locale, 'fileNotProvided') },
        { status: 400 }
      )
    }

    if (type !== 'image' && type !== 'video') {
      return NextResponse.json(
        { error: apiMsg(locale, 'uploadTypeInvalid') },
        { status: 400 }
      )
    }

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
}
