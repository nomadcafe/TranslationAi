import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { getKimiApiBaseUrl } from '@/lib/server/kimi-api-base';
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

    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: apiMsg(locale, 'apiKeyNotFound') },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: getKimiApiBaseUrl(),
    });

    const systemContent =
      locale === 'zh'
        ? `你是专业译者。将下列文本翻译成 ${targetLanguage}，保持原有格式与风格。`
        : `You are a professional translator. Translate the following text to ${targetLanguage}. Keep the original format and style.`;

    const completion = await openai.chat.completions.create({
      model: 'moonshot-v1-128k',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: text }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const translatedText = completion.choices[0]?.message?.content;
    if (!translatedText) {
      return NextResponse.json(
        { error: apiMsg(locale, 'noTranslationResult') },
        { status: 500 }
      );
    }

    void saveTranslation({
      userId: auth.userId,
      sourceText: text,
      translatedText,
      targetLanguage,
      service: 'kimi',
    })
    return NextResponse.json({ translatedText });
  } catch (error: any) {
    console.error('Kimi translation error:', error);
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'translateFailed') },
      { status: 500 }
    );
  }
})
