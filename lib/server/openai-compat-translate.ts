import OpenAI from 'openai'

// Keep output headroom well above the 10k-char input cap so CJK → English and
// other expansion-prone directions do not get silently cut by the provider.
export const MAX_OUTPUT_TOKENS = 8000

export interface TranslationResult {
  text: string
  /** True if the provider truncated output at max_tokens. */
  truncated: boolean
}

export interface OpenAICompatOpts {
  apiKey: string | undefined
  baseURL: string
  model: string
  systemPrompt?: string
  userPrompt?: string
  temperature?: number
  extraBody?: Record<string, unknown>
}

export function defaultSystemPrompt(targetLanguage: string): string {
  return `You are a professional translator. Translate the following text to ${targetLanguage}. Only return the translated text, no explanations.`
}

/**
 * Translate via any OpenAI-compatible chat completion endpoint. Throws when
 * the provider returns no content; callers must also check `truncated` to
 * surface a warning for partial outputs.
 */
export async function openAICompatTranslate(
  opts: OpenAICompatOpts,
  text: string,
  targetLanguage: string,
  signal: AbortSignal,
): Promise<TranslationResult> {
  if (!opts.apiKey) throw new Error('API key not found')

  const openai = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL })
  const response = await openai.chat.completions.create(
    {
      model: opts.model,
      messages: [
        {
          role: 'system',
          content: opts.systemPrompt ?? defaultSystemPrompt(targetLanguage),
        },
        { role: 'user', content: opts.userPrompt ?? text },
      ],
      temperature: opts.temperature ?? 0.3,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...opts.extraBody,
    },
    { signal },
  )

  const choice = response.choices[0]
  const content = choice?.message?.content ?? ''
  if (!content) throw new Error('Empty translation from provider')
  return { text: content, truncated: choice.finish_reason === 'length' }
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: unknown }).name
  return name === 'AbortError'
}
