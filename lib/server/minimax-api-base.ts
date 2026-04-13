/**
 * MiniMax Open Platform — OpenAI-compatible text API.
 * Console: https://platform.minimax.io
 * @see https://platform.minimax.io/docs/api-reference/api-overview
 */
export const MINIMAX_OPENAI_BASE_URL = 'https://api.minimax.io/v1' as const

export function getMinimaxOpenAiBaseUrl(): string {
  const override = process.env.MINIMAX_OPENAI_BASE_URL?.trim()
  if (override) return override.replace(/\/$/, '')
  return MINIMAX_OPENAI_BASE_URL
}

/** API key: prefer MINIMAX_API_KEY; MINNIMAX_API_KEY kept as deprecated alias. */
export function getMinimaxApiKey(): string | undefined {
  return (
    process.env.MINIMAX_API_KEY?.trim() ||
    process.env.MINNIMAX_API_KEY?.trim() ||
    undefined
  )
}

/** Chat model for OpenAI-compatible `/v1/chat/completions`. */
export function getMinimaxChatModel(): string {
  return (
    process.env.MINIMAX_CHAT_MODEL?.trim() ||
    'MiniMax-M2.5'
  )
}
