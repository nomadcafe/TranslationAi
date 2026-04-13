/**
 * Alibaba Cloud Model Studio (Qwen / DashScope) — region-specific endpoints.
 * Default: Singapore (international). Keys are not interchangeable across regions.
 * @see https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope
 */

export type QwenDashScopeRegion = 'intl' | 'us' | 'cn'

function qwenDashScopeRegion(): QwenDashScopeRegion {
  const r = process.env.QWEN_DASHSCOPE_REGION?.trim().toLowerCase()
  if (r === 'us' || r === 'cn' || r === 'intl') return r
  return 'intl'
}

/** OpenAI-compatible base for the OpenAI SDK (`chat.completions`, etc.). */
export function getQwenCompatibleBaseUrl(): string {
  const override = process.env.QWEN_COMPATIBLE_BASE_URL?.trim()
  if (override) return override.replace(/\/$/, '')
  switch (qwenDashScopeRegion()) {
    case 'us':
      return 'https://dashscope-us.aliyuncs.com/compatible-mode/v1'
    case 'cn':
      return 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    default:
      return 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  }
}

export function qwenChatCompletionsUrl(): string {
  return `${getQwenCompatibleBaseUrl()}/chat/completions`
}

/** Native DashScope text-generation HTTP API (used by `/api/qwen/translate`). */
export function qwenTextGenerationUrl(): string {
  const override = process.env.QWEN_TEXT_GENERATION_URL?.trim()
  if (override) return override
  switch (qwenDashScopeRegion()) {
    case 'us':
      return 'https://dashscope-us.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
    case 'cn':
      return 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
    default:
      return 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
  }
}
