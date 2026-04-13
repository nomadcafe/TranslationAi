import { NextResponse } from 'next/server'
import OSS from 'ali-oss'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '@/lib/server/require-auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { aliyunOssSdkRegion } from '@/lib/server/aliyun-region'

const MAX_FILE_BYTES = 100 * 1024 * 1024 // 100MB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_EXT = ['.mp4', '.webm', '.mov', '.jpg', '.jpeg', '.png', '.gif', '.webp']

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ message: apiMsg(locale, 'unauthenticated') }, { status: 401 })

    if (!process.env.ALIYUN_OSS_BUCKET || !process.env.ALIYUN_OSS_REGION) {
      return NextResponse.json({ message: apiMsg(locale, 'ossEnvMissing') }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { message: apiMsg(locale, 'missingUploadFile') },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { message: apiMsg(locale, 'fileTooLarge100Mb') },
        { status: 413 }
      )
    }

    const allowedTypes = [...ALLOWED_VIDEO_TYPES, ...ALLOWED_IMAGE_TYPES]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { message: apiMsg(locale, 'ossMimeNotAllowed') },
        { status: 400 }
      )
    }

    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { message: apiMsg(locale, 'ossExtNotAllowed') },
        { status: 400 }
      )
    }

    console.log('文件信息:', {
      name: file.name,
      type: file.type,
      size: file.size
    })

    // OSS client from long-lived server credentials.
    const ossClient = new OSS({
      region: aliyunOssSdkRegion(),
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
      bucket: process.env.ALIYUN_OSS_BUCKET || '',
    })

    try {
      // Raw body -> Buffer for put().
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Put object to bucket.
      const ext = file.name.split('.').pop()
      const fileName = `videos/${uuidv4()}.${ext}`
      console.log('开始上传文件到 OSS...')
      
      // ali-oss put may be callback-style; promisify.
      const uploadResult = await new Promise((resolve, reject) => {
        try {
          // @ts-ignore
          ossClient.put(fileName, buffer).then(result => {
            resolve(result)
          }).catch(err => {
            reject(err)
          })
        } catch (err) {
          reject(err)
        }
      })

      console.log('文件上传成功:', uploadResult)

      return NextResponse.json({
        success: true,
        url: (uploadResult as any).url
      })
    } catch (uploadError: any) {
      console.error('OSS上传错误:', {
        name: uploadError.name,
        message: uploadError.message,
        code: uploadError.code,
        requestId: uploadError.requestId,
        stack: uploadError.stack
      })
      throw new Error(`${apiMsg(locale, 'fileUploadFailed')}: ${uploadError.message}`)
    }

  } catch (error: any) {
    console.error('处理请求错误:', error)
    return NextResponse.json(
      { message: error.message || apiMsg(locale, 'fileUploadFailed') },
      { status: 500 }
    )
  }
} 