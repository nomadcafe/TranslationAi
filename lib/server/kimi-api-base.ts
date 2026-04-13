/**
 * Kimi (Moonshot) Open Platform — OpenAI-compatible API (international).
 * Keys: https://platform.kimi.ai / https://platform.moonshot.ai
 * @see https://platform.moonshot.ai/docs/api-reference
 */
export const KIMI_OPENAI_BASE_URL = 'https://api.moonshot.ai/v1' as const

export function getKimiApiBaseUrl(): string {
  return KIMI_OPENAI_BASE_URL
}
