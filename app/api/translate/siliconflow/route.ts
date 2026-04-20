import { NextResponse, after } from 'next/server';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { parseJson } from '@/lib/server/validate';
import { TranslateBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { saveTranslation } from '@/lib/server/translations';
import {
  openAICompatTranslate,
  isAbortError,
} from '@/lib/server/openai-compat-translate';

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  const signal = request.signal;
  try {
    const parsed = await parseJson(request, TranslateBody, locale);
    if (!parsed.ok) return parsed.response;
    const { text, targetLanguage } = parsed.data;

    const rateCheck = await checkRateLimit(auth.userId, 'translate');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      );
    }

    const systemContent =
      locale === 'zh'
        ? '你是专业译者。直接输出译文，不要解释。'
        : 'You are a professional translator. Translate the text directly without any explanations.';

    const result = await openAICompatTranslate(
      {
        apiKey: process.env.SILICONFLOW_API_KEY,
        baseURL: 'https://api.siliconflow.com/v1',
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        systemPrompt: systemContent,
        userPrompt: `Translate to ${targetLanguage}:\n${text}`,
      },
      text,
      targetLanguage,
      signal,
    );

    if (result.text) {
      after(() =>
        saveTranslation({
          userId: auth.userId,
          sourceText: text,
          translatedText: result.text,
          targetLanguage,
          service: 'siliconflow',
        }),
      );
    }
    return NextResponse.json({ text: result.text, truncated: result.truncated });
  } catch (error) {
    if (isAbortError(error) || request.signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 });
    }
    console.error(
      `[translate/siliconflow] userId=${auth.userId} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    return NextResponse.json(
      { error: apiMsg(locale, 'translateFailed') },
      { status: 500 },
    );
  }
})
