import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { withAuth } from '@/lib/server/with-auth'
import { getKimiApiBaseUrl } from '@/lib/server/kimi-api-base'
import { ZHIPU_PAAS_BASE } from '@/lib/server/zhipu-api-base'
import { ZHIPU_TEXT_MODEL } from '@/lib/server/zhipu'
import { getQwenCompatibleBaseUrl } from '@/lib/server/qwen-api-base'
import { getMinimaxApiKey, getMinimaxChatModel, getMinimaxOpenAiBaseUrl } from '@/lib/server/minimax-api-base'
import { streamWithAnthropicClaude } from '@/lib/server/anthropic-claude'
import { parseJson } from '@/lib/server/validate'
import { TranslateBody } from '@/lib/validation/schemas'
import { saveTranslation } from '@/lib/server/translations'
import { MAX_OUTPUT_TOKENS, isAbortError } from '@/lib/server/openai-compat-translate'

const SYSTEM_PROMPT = 'You are a professional translator. Translate the text directly without any explanations. Preserve paragraphs and line breaks.'

/**
 * Pass the stream through to the client while buffering a text copy that the
 * caller receives via onComplete once the upstream writer closes. The flush is
 * async and awaits onComplete so the response stream stays open until the DB
 * write finishes — otherwise the serverless runtime can tear down mid-write.
 */
function teeStreamForCapture(
  src: ReadableStream<Uint8Array>,
  onComplete: (fullText: string) => Promise<void> | void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  let buffer = ''
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      controller.enqueue(chunk)
    },
    async flush() {
      buffer += decoder.decode()
      if (buffer.length > 0) {
        try {
          await onComplete(buffer)
        } catch (err) {
          console.error('[translate/stream] onComplete failed:', err instanceof Error ? err.message : err)
        }
      }
    },
  })
  return src.pipeThrough(transform)
}

/** Build a ReadableStream via OpenAI-compatible SDK (covers most providers). */
function streamWithOpenAI(
  text: string,
  targetLanguage: string,
  apiKey: string,
  baseURL: string,
  model: string,
  signal: AbortSignal,
  systemPrompt = SYSTEM_PROMPT,
): ReadableStream<Uint8Array> {
  const openai = new OpenAI({ apiKey, baseURL })
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const completion = await openai.chat.completions.create(
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Translate to ${targetLanguage}:\n${text}` },
            ],
            stream: true,
            temperature: 0.3,
            max_tokens: MAX_OUTPUT_TOKENS,
          },
          { signal },
        )

        for await (const chunk of completion) {
          const token = chunk.choices[0]?.delta?.content ?? ''
          if (token) controller.enqueue(encoder.encode(token))
        }
      } catch (err) {
        if (!isAbortError(err)) {
          console.error('[translate/stream] upstream failed:', err instanceof Error ? err.message : err)
        }
      } finally {
        controller.close()
      }
    },
  })
}

export const POST = withAuth(async (request, auth) => {
  const locale = getRequestLocale(request)
  const signal = request.signal

  const rateCheck = await checkRateLimit(auth.userId, 'translate')
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } }
    )
  }

  const parsed = await parseJson(request, TranslateBody, locale)
  if (!parsed.ok) return parsed.response
  const { text, targetLanguage, service = 'deepseek' } = parsed.data

  try {
    let stream: ReadableStream<Uint8Array>

    switch (service) {
      case 'deepseek': {
        const apiKey = process.env.DEEPSEEK_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.deepseek.com/v1', 'deepseek-chat', signal)
        break
      }
      case 'qwen': {
        const apiKey = process.env.QWEN_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, getQwenCompatibleBaseUrl(), 'qwen-max', signal)
        break
      }
      case 'zhipu': {
        const apiKey = process.env.ZHIPU_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, ZHIPU_PAAS_BASE, ZHIPU_TEXT_MODEL, signal)
        break
      }
      case '4o-mini': {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.openai.com/v1', 'gpt-4o-mini', signal)
        break
      }
      case 'hunyuan': {
        const apiKey = process.env.TENCENT_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(
          text, targetLanguage, apiKey,
          'https://api.hunyuan.cloud.tencent.com/v1', 'hunyuan-turbo', signal,
          '你是一个专业的翻译助手，请直接翻译文本，不要添加任何解释。'
        )
        break
      }
      case 'minimax': {
        const apiKey = getMinimaxApiKey()
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, getMinimaxOpenAiBaseUrl(), getMinimaxChatModel(), signal)
        break
      }
      case 'siliconflow': {
        const apiKey = process.env.SILICONFLOW_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.siliconflow.com/v1', 'meta-llama/Llama-3.3-70B-Instruct', signal)
        break
      }
      case 'kimi': {
        const apiKey = process.env.KIMI_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, getKimiApiBaseUrl(), 'moonshot-v1-128k', signal)
        break
      }
      case 'step': {
        const apiKey = process.env.STEP_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.stepfun.ai/v1', 'step-2-16k', signal)
        break
      }
      case 'claude':
      case 'claude_3_5': {
        stream = streamWithAnthropicClaude(text, targetLanguage, SYSTEM_PROMPT, signal)
        break
      }
      case 'gemini': {
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        const { GoogleGenerativeAI } = await import('@google/generative-ai')
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
        const encoder = new TextEncoder()
        stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              // Gemini SDK (v0.x) lacks AbortSignal support; check before and
              // between chunks so an already-aborted request bails out early.
              if (signal.aborted) return
              const result = await model.generateContentStream([
                `Translate the following text to ${targetLanguage}. Return only the translated text, preserving paragraphs and line breaks:`,
                text,
              ])
              for await (const chunk of result.stream) {
                if (signal.aborted) break
                const token = chunk.text()
                if (token) controller.enqueue(encoder.encode(token))
              }
            } catch (err) {
              if (!isAbortError(err)) {
                console.error('[translate/stream] gemini failed:', err instanceof Error ? err.message : err)
              }
            } finally {
              controller.close()
            }
          },
        })
        break
      }
    }

    const captured = teeStreamForCapture(stream, async (fullText) => {
      await saveTranslation({
        userId: auth.userId,
        sourceText: text,
        translatedText: fullText,
        targetLanguage,
        service: String(service),
      })
    })

    return new Response(captured, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      return NextResponse.json({ error: 'aborted' }, { status: 499 })
    }
    console.error(
      `[translate/stream] userId=${auth.userId} service=${service} error:`,
      error instanceof Error ? (error.stack ?? error.message) : error,
    )
    return NextResponse.json({ error: apiMsg(locale, 'translateFailed') }, { status: 500 })
  }
})
