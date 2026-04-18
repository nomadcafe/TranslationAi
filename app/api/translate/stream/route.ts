import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/require-auth'
import { getRequestLocale, apiMsg } from '@/lib/server/request-i18n'
import { checkRateLimit } from '@/lib/server/rate-limit'
import { getKimiApiBaseUrl } from '@/lib/server/kimi-api-base'
import { ZHIPU_PAAS_BASE } from '@/lib/server/zhipu-api-base'
import { ZHIPU_TEXT_MODEL } from '@/lib/server/zhipu'
import { getQwenCompatibleBaseUrl } from '@/lib/server/qwen-api-base'
import { getMinimaxApiKey, getMinimaxChatModel, getMinimaxOpenAiBaseUrl } from '@/lib/server/minimax-api-base'
import { streamWithAnthropicClaude } from '@/lib/server/anthropic-claude'

const MAX_TEXT_CHARS = 10_000

const SYSTEM_PROMPT = 'You are a professional translator. Translate the text directly without any explanations. Preserve paragraphs and line breaks.'

/** Build a ReadableStream via OpenAI-compatible SDK (covers most providers). */
function streamWithOpenAI(
  text: string,
  targetLanguage: string,
  apiKey: string,
  baseURL: string,
  model: string,
  systemPrompt = SYSTEM_PROMPT
): ReadableStream<Uint8Array> {
  const openai = new OpenAI({ apiKey, baseURL })
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Translate to ${targetLanguage}:\n${text}` },
          ],
          stream: true,
          temperature: 0.3,
          max_tokens: 4000,
        })

        for await (const chunk of completion) {
          const token = chunk.choices[0]?.delta?.content ?? ''
          if (token) controller.enqueue(encoder.encode(token))
        }
      } finally {
        controller.close()
      }
    },
  })
}

export async function POST(request: Request) {
  const locale = getRequestLocale(request)

  const auth = await requireAuth()
  if (!auth) {
    return NextResponse.json({ error: apiMsg(locale, 'unauthenticated') }, { status: 401 })
  }

  const rateCheck = checkRateLimit(auth.userId, 'translate')
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: apiMsg(locale, 'rateLimitExceeded'), retryAfter: rateCheck.retryAfter },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter ?? 60) } }
    )
  }

  let body: { text?: unknown; targetLanguage?: unknown; service?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: apiMsg(locale, 'missingParams') }, { status: 400 })
  }

  const { text, targetLanguage, service = 'deepseek' } = body

  if (!text || !targetLanguage || typeof text !== 'string' || typeof targetLanguage !== 'string') {
    return NextResponse.json({ error: apiMsg(locale, 'missingParams') }, { status: 400 })
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: apiMsg(locale, 'textTooLong') }, { status: 400 })
  }

  try {
    let stream: ReadableStream<Uint8Array>

    switch (service) {
      case 'deepseek': {
        const apiKey = process.env.DEEPSEEK_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.deepseek.com/v1', 'deepseek-chat')
        break
      }
      case 'qwen': {
        const apiKey = process.env.QWEN_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, getQwenCompatibleBaseUrl(), 'qwen-max')
        break
      }
      case 'zhipu': {
        const apiKey = process.env.ZHIPU_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, ZHIPU_PAAS_BASE, ZHIPU_TEXT_MODEL)
        break
      }
      case '4o-mini': {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.openai.com/v1', 'gpt-4o-mini')
        break
      }
      case 'hunyuan': {
        const apiKey = process.env.TENCENT_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(
          text, targetLanguage, apiKey,
          'https://api.hunyuan.cloud.tencent.com/v1', 'hunyuan-turbo',
          '你是一个专业的翻译助手，请直接翻译文本，不要添加任何解释。'
        )
        break
      }
      case 'minimax': {
        const apiKey = getMinimaxApiKey()
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, getMinimaxOpenAiBaseUrl(), getMinimaxChatModel())
        break
      }
      case 'siliconflow': {
        const apiKey = process.env.SILICONFLOW_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.siliconflow.com/v1', 'meta-llama/Llama-3.3-70B-Instruct')
        break
      }
      case 'kimi': {
        const apiKey = process.env.KIMI_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, getKimiApiBaseUrl(), 'moonshot-v1-128k')
        break
      }
      case 'step': {
        const apiKey = process.env.STEP_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.stepfun.ai/v1', 'step-2-16k')
        break
      }
      case 'claude':
      case 'claude_3_5': {
        stream = streamWithAnthropicClaude(text, targetLanguage, SYSTEM_PROMPT)
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
              const result = await model.generateContentStream([
                `Translate the following text to ${targetLanguage}. Return only the translated text, preserving paragraphs and line breaks:`,
                text,
              ])
              for await (const chunk of result.stream) {
                const token = chunk.text()
                if (token) controller.enqueue(encoder.encode(token))
              }
            } finally {
              controller.close()
            }
          },
        })
        break
      }
      default: {
        const apiKey = process.env.DEEPSEEK_API_KEY
        if (!apiKey) return NextResponse.json({ error: apiMsg(locale, 'apiKeyNotFound') }, { status: 500 })
        stream = streamWithOpenAI(text, targetLanguage, apiKey, 'https://api.deepseek.com/v1', 'deepseek-chat')
      }
    }

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : ''
    console.error('Stream translate error:', msg)
    return NextResponse.json({ error: msg || apiMsg(locale, 'translateFailed') }, { status: 500 })
  }
}
