import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/require-auth';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { qwenTextGenerationUrl } from '@/lib/server/qwen-api-base';

export async function POST(request: Request) {
  const locale = getRequestLocale(request);
  try {
    const auth = await requireAuth();
    if (!auth) return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 });

    const { text, targetLang } = await request.json();

    if (!text || !targetLang) {
      return NextResponse.json(
        { error: apiMsg(locale, 'missingParams') },
        { status: 400 }
      );
    }

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
    return NextResponse.json({ text: result.output.text });
  } catch (error: any) {
    console.error('Error in Qwen translation:', error);
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'translateFailed') },
      { status: 500 }
    );
  }
}
