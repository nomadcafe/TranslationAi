import { NextResponse, after } from 'next/server';
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { withAuth } from '@/lib/server/with-auth';
import { getKimiApiBaseUrl } from '@/lib/server/kimi-api-base';
import { ZHIPU_PAAS_BASE } from '@/lib/server/zhipu-api-base';
import { ZHIPU_TEXT_MODEL } from '@/lib/server/zhipu';
import { getQwenCompatibleBaseUrl } from '@/lib/server/qwen-api-base';
import {
  getMinimaxApiKey,
  getMinimaxChatModel,
  getMinimaxOpenAiBaseUrl,
} from '@/lib/server/minimax-api-base';
import { translateWithAnthropicClaude } from '@/lib/server/anthropic-claude';
import { parseJson } from '@/lib/server/validate';
import { TranslateBody, type TranslateService } from '@/lib/validation/schemas';
import { saveTranslation } from '@/lib/server/translations';
import {
  openAICompatTranslate,
  isAbortError,
  type TranslationResult,
} from '@/lib/server/openai-compat-translate';

function translateWithDeepSeekAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
    text, targetLanguage, signal,
  );
}

function translateWithQwenAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: process.env.QWEN_API_KEY,
      baseURL: getQwenCompatibleBaseUrl(),
      model: 'qwen-max',
    },
    text, targetLanguage, signal,
  );
}

function translateWithZhipuAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: process.env.ZHIPU_API_KEY,
      baseURL: ZHIPU_PAAS_BASE,
      model: ZHIPU_TEXT_MODEL,
    },
    text, targetLanguage, signal,
  );
}

function translateWith4oMiniAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    },
    text, targetLanguage, signal,
  );
}

function translateWithHunyuanAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: process.env.TENCENT_API_KEY,
      baseURL: 'https://api.hunyuan.cloud.tencent.com/v1',
      model: 'hunyuan-turbo',
      systemPrompt: '你是一个专业的翻译助手，请直接翻译文本，不要添加任何解释。',
      userPrompt: `将以下文本翻译成${targetLanguage}：\n\n${text}`,
      temperature: 0.1,
      extraBody: { top_p: 0.7, enable_enhancement: true },
    },
    text, targetLanguage, signal,
  );
}

function translateWithMinimaxAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: getMinimaxApiKey(),
      baseURL: getMinimaxOpenAiBaseUrl(),
      model: getMinimaxChatModel(),
      systemPrompt: 'You are a professional translator. Translate the text directly without any explanations.',
      userPrompt: `Translate to ${targetLanguage}:\n${text}`,
    },
    text, targetLanguage, signal,
  );
}

function translateWithSiliconFlowAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseURL: 'https://api.siliconflow.com/v1',
      model: 'meta-llama/Llama-3.3-70B-Instruct',
      systemPrompt: 'You are a professional translator. Translate the text directly without any explanations.',
      userPrompt: `Translate to ${targetLanguage}:\n${text}`,
    },
    text, targetLanguage, signal,
  );
}

function translateWithKimiAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: process.env.KIMI_API_KEY,
      baseURL: getKimiApiBaseUrl(),
      model: 'moonshot-v1-128k',
      systemPrompt: `You are a professional translator. Translate the following text to ${targetLanguage}. Keep the original format and style.`,
    },
    text, targetLanguage, signal,
  );
}

function translateWithStepAPI(text: string, targetLanguage: string, signal: AbortSignal) {
  return openAICompatTranslate(
    {
      apiKey: process.env.STEP_API_KEY,
      baseURL: 'https://api.stepfun.ai/v1',
      model: 'step-2-16k',
    },
    text, targetLanguage, signal,
  );
}

async function translateWithClaudeAPI(
  text: string,
  targetLanguage: string,
  signal: AbortSignal,
): Promise<TranslationResult> {
  return translateWithAnthropicClaude(
    text,
    targetLanguage,
    'You are a professional translator. Translate the text directly without any explanations.',
    signal,
  );
}

async function translateWithGeminiAPI(
  text: string,
  targetLanguage: string,
  signal: AbortSignal,
): Promise<TranslationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key not found');
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Gemini SDK (v0.x) lacks AbortSignal support in generateContent, so we only
  // honor aborts already raised before issuing the request. Mid-flight cancels
  // will let the upstream call finish, but the response is discarded below.
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

  const result = await model.generateContent([
    `Translate the following text to ${targetLanguage}. Return only the translated text, preserving paragraphs and line breaks:`,
    text,
  ]);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await result.response;
  const out = response.text().trim();
  if (!out) throw new Error('Empty translation from provider');
  const finishReason = response.candidates?.[0]?.finishReason ?? '';
  return { text: out, truncated: finishReason === 'MAX_TOKENS' };
}

async function dispatch(
  service: TranslateService,
  text: string,
  targetLanguage: string,
  signal: AbortSignal,
): Promise<TranslationResult> {
  switch (service) {
    case 'deepseek':    return translateWithDeepSeekAPI(text, targetLanguage, signal);
    case 'qwen':        return translateWithQwenAPI(text, targetLanguage, signal);
    case 'zhipu':       return translateWithZhipuAPI(text, targetLanguage, signal);
    case '4o-mini':     return translateWith4oMiniAPI(text, targetLanguage, signal);
    case 'hunyuan':     return translateWithHunyuanAPI(text, targetLanguage, signal);
    case 'minimax':     return translateWithMinimaxAPI(text, targetLanguage, signal);
    case 'siliconflow': return translateWithSiliconFlowAPI(text, targetLanguage, signal);
    case 'kimi':        return translateWithKimiAPI(text, targetLanguage, signal);
    case 'step':        return translateWithStepAPI(text, targetLanguage, signal);
    case 'claude':
    case 'claude_3_5': return translateWithClaudeAPI(text, targetLanguage, signal);
    case 'gemini':      return translateWithGeminiAPI(text, targetLanguage, signal);
  }
}

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request);
  const signal = request.signal;

  try {
    const parsed = await parseJson(request, TranslateBody, locale);
    if (!parsed.ok) return parsed.response;
    const { text, targetLanguage, service = 'deepseek' } = parsed.data;

    const rateCheck = await checkRateLimit(auth.userId, 'translate');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } },
      );
    }

    let result: TranslationResult;
    let actualService: TranslateService = service;

    try {
      result = await dispatch(service, text, targetLanguage, signal);
    } catch (serviceError) {
      if (isAbortError(serviceError) || signal.aborted) throw serviceError;
      console.error(
        `[translate] userId=${auth.userId} service=${service} failed:`,
        serviceError instanceof Error ? serviceError.message : serviceError,
      );
      if (service === 'deepseek') throw serviceError;
      // Fallback: retry via DeepSeek. Record the service that actually
      // produced the text so history doesn't lie about provenance.
      console.log(`[translate] userId=${auth.userId} fallback: ${service} -> deepseek`);
      result = await translateWithDeepSeekAPI(text, targetLanguage, signal);
      actualService = 'deepseek';
    }

    if (result.text) {
      // Defer history persistence until after the response is sent. `after()`
      // keeps the serverless runtime alive for the callback, unlike
      // fire-and-forget which can be killed mid-write.
      after(() =>
        saveTranslation({
          userId: auth.userId,
          sourceText: text,
          translatedText: result.text,
          targetLanguage,
          service: actualService,
        }),
      );
    }

    return NextResponse.json({
      text: result.text,
      service: actualService,
      fellBack: actualService !== service,
      truncated: result.truncated,
    });
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      // 499 mirrors nginx's "client closed request" convention.
      return NextResponse.json({ error: 'aborted' }, { status: 499 });
    }
    console.error(
      '[translate] error:',
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    return NextResponse.json(
      { error: apiMsg(locale, 'translateFailed') },
      { status: 500 },
    );
  }
});
