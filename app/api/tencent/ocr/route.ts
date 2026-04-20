import { NextResponse } from 'next/server';
import { checkAndRecordUsage } from '@/lib/server/quota';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { parseJson } from '@/lib/server/validate';
import { ImageBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';
import { checkRateLimit } from '@/lib/server/rate-limit';

const tencentcloud = require("tencentcloud-sdk-nodejs");
const OcrClient = tencentcloud.ocr.v20181119.Client;

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  try {
    const rateCheck = await checkRateLimit(auth.userId, 'default');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, message: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      );
    }

    const quota = await checkAndRecordUsage(auth.userId, 'image', locale);
    if (!quota.allowed) return NextResponse.json({ success: false, message: quota.error }, { status: 403 });

    const parsed = await parseJson(request, ImageBody, locale, {
      errorKey: 'missingImageData',
      errorField: 'message',
    });
    if (!parsed.ok) return parsed.response;
    const { image } = parsed.data;

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
    });

    const base64Data = image.split(',')[1];
    const result = await client.GeneralBasicOCR({
      ImageBase64: base64Data,
      LanguageType: 'auto',
    });

    if (!result || !result.TextDetections) {
      throw new Error('ocrGenericFailed');
    }

    const textLines = result.TextDetections.map((item: { DetectedText?: string }) => item.DetectedText).filter(Boolean);
    const text = textLines.join('\n');

    return NextResponse.json({
      success: true,
      result: text
    });
  } catch (error) {
    console.error(
      `[ocr/tencent-legacy] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    const code = (error as { code?: string })?.code
    const messageKey = code === 'AuthFailure' ? 'tencentAuthFailure' : 'ocrGenericFailed'
    return NextResponse.json(
      {
        success: false,
        message: apiMsg(locale, messageKey)
      },
      { status: 500 }
    );
  }
}, { errorField: 'message' })
