import { NextResponse } from 'next/server';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import {
  getAnthropicApiKey,
  translateWithAnthropicClaude,
} from '@/lib/server/anthropic-claude';
import { parseJson } from '@/lib/server/validate';
import { TranslateBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';
import { saveTranslation } from '@/lib/server/translations';

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  try {
    const parsed = await parseJson(request, TranslateBody, locale);
    if (!parsed.ok) return parsed.response;
    const { text, targetLanguage } = parsed.data;

    if (!getAnthropicApiKey()) {
      return NextResponse.json(
        { error: apiMsg(locale, 'anthropicKeyNotFound') },
        { status: 500 }
      );
    }

    const systemContent =
      locale === 'zh'
        ? '你是专业译者。直接输出译文，不要解释。'
        : 'You are a professional translator. Translate the text directly without any explanations.';

    const translatedText = await translateWithAnthropicClaude(
      text,
      targetLanguage,
      systemContent
    );
    if (translatedText) {
      void saveTranslation({
        userId: auth.userId,
        sourceText: text,
        translatedText,
        targetLanguage,
        service: 'claude',
      })
    }
    return NextResponse.json({ text: translatedText });
  } catch (error: any) {
    console.error('Claude translation error:', error);
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'translateFailed') },
      { status: 500 }
    );
  }
})
