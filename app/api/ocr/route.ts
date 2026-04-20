import { NextResponse } from 'next/server'
import * as tencentcloud from 'tencentcloud-sdk-nodejs-ocr'
import { checkAndRecordUsage } from '@/lib/server/quota'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { parseJson } from '@/lib/server/validate'
import { ImageBody } from '@/lib/validation/schemas'
import { withAuth } from '@/lib/server/with-auth'
import { checkRateLimit } from '@/lib/server/rate-limit'

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

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  try {
    const rateCheck = await checkRateLimit(auth.userId, 'default')
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, message: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      )
    }

    const quota = await checkAndRecordUsage(auth.userId, 'image', locale)
    if (!quota.allowed) return NextResponse.json({ success: false, message: quota.error }, { status: 403 })

    const parsed = await parseJson(request, ImageBody, locale, {
      errorKey: 'missingImageData',
      errorField: 'message',
    })
    if (!parsed.ok) return parsed.response
    const { image } = parsed.data

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
  } catch (error) {
    console.error(
      `[ocr/tencent] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json(
      { success: false, message: apiMsg(locale, 'ocrGenericFailed') },
      { status: 500 }
    )
  }
}, { errorField: 'message' })
