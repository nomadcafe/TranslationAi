import { NextResponse } from 'next/server';
import { checkAndRecordUsage } from '@/lib/server/quota';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { parseJson } from '@/lib/server/validate';
import { AsrRecognizeBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { isAbortError } from '@/lib/server/openai-compat-translate';

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  const signal = request.signal;
  try {
    const rateCheck = await checkRateLimit(auth.userId, 'default');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      );
    }

    const quota = await checkAndRecordUsage(auth.userId, 'speech', locale);
    if (!quota.allowed) return NextResponse.json({ error: quota.error }, { status: 403 });

    const parsed = await parseJson(request, AsrRecognizeBody, locale);
    if (!parsed.ok) return parsed.response;
    const { audioUrl, appKey, token } = parsed.data;

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
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(
        `[asr/aliyun] userId=${auth.userId} upstream ${response.status}:`,
        body.slice(0, 500),
      );
      throw new Error('upstream');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 });
    }
    console.error(
      `[asr/aliyun] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    return NextResponse.json(
      { error: apiMsg(locale, 'aliyunAsrRequestFailed') },
      { status: 500 }
    );
  }
})
