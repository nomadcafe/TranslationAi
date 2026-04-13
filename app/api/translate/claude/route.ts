import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/require-auth';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import {
  getAnthropicApiKey,
  translateWithAnthropicClaude,
} from '@/lib/server/anthropic-claude';

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
    return NextResponse.json({ text: translatedText });
  } catch (error: any) {
    console.error('Claude translation error:', error);
    return NextResponse.json(
      { error: error.message || apiMsg(locale, 'translateFailed') },
      { status: 500 }
    );
  }
}
