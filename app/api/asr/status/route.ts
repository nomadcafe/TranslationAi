import { NextResponse } from 'next/server';
import { sign } from '@/lib/server/tencent-sign';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { parseJson } from '@/lib/server/validate';
import { TaskIdBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { isAbortError } from '@/lib/server/openai-compat-translate';

const endpoint = 'asr.tencentcloudapi.com';
const service = 'asr';
const version = '2019-06-14';
const region = 'ap-guangzhou';
const action = 'DescribeTaskStatus';

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  const signal = request.signal;

  try {
    // Status polling — a generous bucket; clients may poll every second.
    const rateCheck = await checkRateLimit(auth.userId, 'default');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      );
    }

    const parsed = await parseJson(request, TaskIdBody, locale);
    if (!parsed.ok) return parsed.response;
    const { taskId } = parsed.data;

    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      TaskId: taskId,
    };

    const signature = sign({
      secretId: process.env.TENCENT_SECRET_ID || '',
      secretKey: process.env.TENCENT_SECRET_KEY || '',
      endpoint,
      service,
      version,
      region,
      action,
      timestamp,
      payload: params,
    });

    const response = await fetch(`https://${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': signature,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Region': region,
        'X-TC-Timestamp': timestamp.toString(),
      },
      body: JSON.stringify(params),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(
        `[asr/status] upstream ${response.status}:`,
        body.slice(0, 500),
      );
      throw new Error('upstream');
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 });
    }
    console.error(
      '[asr/status] error:',
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    return NextResponse.json(
      { error: apiMsg(locale, 'requestFailed') },
      { status: 500 }
    );
  }
})
