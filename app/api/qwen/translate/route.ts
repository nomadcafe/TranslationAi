import { NextResponse, after } from 'next/server';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { qwenTextGenerationUrl } from '@/lib/server/qwen-api-base';
import { parseJson } from '@/lib/server/validate';
import { TranslateTargetLangBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { saveTranslation } from '@/lib/server/translations';
import { isAbortError } from '@/lib/server/openai-compat-translate';

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  const signal = request.signal;
  try {
    if (!process.env.QWEN_API_KEY?.trim()) {
      return NextResponse.json({ error: apiMsg(locale, 'serviceNotConfigured') }, { status: 503 });
    }

    const rateCheck = await checkRateLimit(auth.userId, 'translate');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      );
    }

    const parsed = await parseJson(request, TranslateTargetLangBody, locale);
    if (!parsed.ok) return parsed.response;
    const { text, targetLang } = parsed.data;

    const systemContent =
      locale === 'zh'
        ? '你是专业译者。直接输出译文，不要解释。'
        : 'You are a professional translator. Translate the text directly without any explanations.';

    const response = await fetch(qwenTextGenerationUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen-max',
        input: {
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: `Translate to ${targetLang}:\n${text}` }
          ]
        },
        parameters: {
          temperature: 0.1,
          max_tokens: 2048,
        }
      }),
      signal,
    });

    if (!response.ok) {
      // Log the raw upstream reason server-side; never leak it to the client.
      const body = await response.text().catch(() => '');
      console.error(
        `[qwen/translate] userId=${auth.userId} upstream ${response.status}:`,
        body.slice(0, 500),
      );
      throw new Error('upstream');
    }

    const result = await response.json();
    const translatedText: string | undefined = result.output?.text;
    if (translatedText) {
      after(() =>
        saveTranslation({
          userId: auth.userId,
          sourceText: text,
          translatedText,
          targetLanguage: targetLang,
          service: 'qwen',
        }),
      );
    }
    return NextResponse.json({ text: translatedText });
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 });
    }
    console.error(
      `[qwen/translate] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    return NextResponse.json(
      { error: apiMsg(locale, 'translateFailed') },
      { status: 500 }
    );
  }
})
