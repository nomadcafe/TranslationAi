import { NextResponse } from 'next/server'
import * as tencentcloud from 'tencentcloud-sdk-nodejs-ocr'
import { requireAuth } from '@/lib/server/require-auth'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'

const OcrClient = tencentcloud.ocr.v20181119.Client

interface TextDetection {
  DetectedText: string;
  Confidence: number;
  Polygon: Array<{
    X: number;
    Y: number;
  }>;
  AdvancedInfo: string;
}

interface OCRResponse {
  TextDetections: TextDetection[];
  Language: string;
  RequestId: string;
}

const client = new OcrClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TENCENT_SECRET_KEY || '',
  },
  region: 'ap-guangzhou',
  profile: {
    signMethod: 'TC3-HMAC-SHA256',
    httpProfile: {
      reqMethod: 'POST',
      reqTimeout: 30,
      endpoint: 'ocr.tencentcloudapi.com',
    },
  },
})

export async function POST(request: Request) {
  const locale = getRequestLocale(request)
  try {
    const auth = await requireAuth()
    if (!auth) return NextResponse.json({ success: false, message: apiMsg(locale, 'unauthenticated') }, { status: 401 })
    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ success: false, message: quota.error }, { status: 403 })

    const { image } = await request.json()

    if (!image) {
      return NextResponse.json(
        { success: false, message: apiMsg(locale, 'missingImageData') },
        { status: 400 }
      )
    }

    const result = await client.GeneralBasicOCR({
      ImageBase64: image,
    }) as OCRResponse

    if (!result || !result.TextDetections || result.TextDetections.length === 0) {
      return NextResponse.json(
        { success: false, message: apiMsg(locale, 'noTextExtracted') },
        { status: 400 }
      )
    }

    const text = result.TextDetections.map((item: TextDetection) => item.DetectedText).join('\n')

    return NextResponse.json({
      success: true,
      text
    })
  } catch (error: any) {
    console.error('腾讯云OCR错误:', error)
    return NextResponse.json(
      { success: false, message: error.message || apiMsg(locale, 'ocrGenericFailed') },
      { status: 500 }
    )
  }
} 