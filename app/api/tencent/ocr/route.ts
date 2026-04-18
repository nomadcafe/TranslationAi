import { NextResponse } from 'next/server';
import { checkAndRecordUsage } from '@/lib/server/quota';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { parseJson } from '@/lib/server/validate';
import { ImageBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';

const tencentcloud = require("tencentcloud-sdk-nodejs");
const OcrClient = tencentcloud.ocr.v20181119.Client;

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  try {
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
      throw new Error(apiMsg(locale, 'ocrGenericFailed'));
    }

    const textLines = result.TextDetections.map((item: any) => item.DetectedText).filter(Boolean);
    const text = textLines.join('\n');

    return NextResponse.json({
      success: true,
      result: text
    });
  } catch (error: any) {
    console.error('腾讯云 OCR 错误:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error.code === 'AuthFailure'
          ? apiMsg(locale, 'tencentAuthFailure')
          : (error.message || apiMsg(locale, 'ocrGenericFailed'))
      },
      { status: 500 }
    );
  }
}, { errorField: 'message' })
