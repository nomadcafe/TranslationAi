import Anthropic from '@anthropic-ai/sdk'

export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || undefined
}

export function getAnthropicClaudeModel(): string {
  return process.env.ANTHROPIC_CLAUDE_MODEL?.trim() || 'claude-sonnet-4-6'
}

export function textFromAnthropicMessage(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

/** Non-streaming translate (used by the regular /api/translate route). */
export async function translateWithAnthropicClaude(
  text: string,
  targetLanguage: string,
  systemPrompt: string
): Promise<string> {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) throw new Error('Anthropic API key not found')

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: getAnthropicClaudeModel(),
    max_tokens: 8192,
    temperature: 0.3,
    // Mark the system prompt as cacheable – saves ~90 % on repeated calls.
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Translate to ${targetLanguage}:\n${text}` }],
  })

  return textFromAnthropicMessage(message)
}

/** Streaming translate – returns a ReadableStream of UTF-8 text chunks. */
export function streamWithAnthropicClaude(
  text: string,
  targetLanguage: string,
  systemPrompt: string
): ReadableStream<Uint8Array> {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) throw new Error('Anthropic API key not found')

  const client = new Anthropic({ apiKey })
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: getAnthropicClaudeModel(),
          max_tokens: 8192,
          temperature: 0.3,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `Translate to ${targetLanguage}:\n${text}` }],
        })

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } finally {
        controller.close()
      }
    },
  })
}
