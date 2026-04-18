import { NextResponse } from 'next/server';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { qwenTextGenerationUrl } from '@/lib/server/qwen-api-base';
import { parseJson } from '@/lib/server/validate';
import { TranslateTargetLangBody } from '@/lib/validation/schemas';
import { withAuth } from '@/lib/server/with-auth';
import { saveTranslation } from '@/lib/server/translations';

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  try {
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
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.message || apiMsg(locale, 'translateFailed') },
        { status: response.status }
      );
    }

    const result = await response.json();
    const translatedText: string | undefined = result.output?.text
    if (translatedText) {
      void saveTranslation({
        userId: auth.userId,
        sourceText: text,
        translatedText,
        targetLanguage: targetLang,
        service: 'qwen',
      })
    }
    return NextResponse.json({ text: translatedText });
  } catch (error: any) {
    console.error('Error in Qwen translation:', error);
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'translateFailed') },
      { status: 500 }
    );
  }
})
