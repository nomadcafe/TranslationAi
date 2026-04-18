import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
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

    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: apiMsg(locale, 'siliconflowKeyNotFound') },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.siliconflow.com/v1'
    });

    const systemContent =
      locale === 'zh'
        ? '你是专业译者。直接输出译文，不要解释。'
        : 'You are a professional translator. Translate the text directly without any explanations.';

    const completion = await openai.chat.completions.create({
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: `Translate to ${targetLanguage}:\n${text}` }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const translatedText = completion.choices[0].message.content;
    if (translatedText) {
      void saveTranslation({
        userId: auth.userId,
        sourceText: text,
        translatedText,
        targetLanguage,
        service: 'siliconflow',
      })
    }
    return NextResponse.json({ text: translatedText });

  } catch (error: any) {
    console.error('SiliconFlow translation error:', error);
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'translateFailed') },
      { status: 500 }
    );
  }
})
