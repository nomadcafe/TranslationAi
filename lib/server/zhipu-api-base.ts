/**
 * Z.AI OpenAPI — same path layout as legacy bigmodel, different host + auth.
 * Keys: https://z.ai/model-api — use Bearer token (not id.secret JWT).
 * @see https://docs.z.ai/guides/overview/quick-start
 */
export const ZHIPU_PAAS_BASE = 'https://api.z.ai/api/paas/v4' as const

export function zhipuChatCompletionsUrl(): string {
  return `${ZHIPU_PAAS_BASE}/chat/completions`
}
