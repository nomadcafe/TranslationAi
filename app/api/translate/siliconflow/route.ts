import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAuth } from '@/lib/server/require-auth';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';

export async function POST(request: Request) {
  const locale = getRequestLocale(request);
  try {
    const auth = await requireAuth();
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 });

    const { text, targetLanguage } = await request.json();

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: apiMsg(locale, 'missingParams') },
        { status: 400 }
      );
    }

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
    return NextResponse.json({ text: translatedText });

  } catch (error: any) {
    console.error('SiliconFlow translation error:', error);
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'translateFailed') },
      { status: 500 }
    );
  }
}
