import { NextResponse } from 'next/server';
import { checkAndRecordUsage } from '@/lib/server/quota';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { parseJson } from '@/lib/server/validate';
import { AsrRecognizeBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  try {
    const quota = await checkAndRecordUsage(auth.userId, 'speech', locale);
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 });

    const parsed = await parseJson(request, AsrRecognizeBody, locale);
    if (!parsed.ok) return parsed.response;
    const { audioUrl, appKey, token, taskId } = parsed.data;

    // Forward to Aliyun speech recognition.
    const response = await fetch('https://nls-gateway.aliyuncs.com/stream/v1/asr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NLS-Token': token,
      },
      body: JSON.stringify({
        appkey: appKey,
        audio_url: audioUrl,
        format: 'wav',
        sample_rate: 16000,
        enable_intermediate_result: true,
        enable_punctuation_prediction: true,
        enable_inverse_text_normalization: true,
      }),
    });

    if (!response.ok) {
      throw new Error(apiMsg(locale, 'aliyunAsrRequestFailed'));
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'ocrFailed') },
      { status: 500 }
    );
  }
})
