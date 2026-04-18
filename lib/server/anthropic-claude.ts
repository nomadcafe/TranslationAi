import Anthropic from '@anthropic-ai/sdk'

/**
 * Claude via Anthropic API (Messages).
 * @see https://docs.anthropic.com/en/api/messages
 */
export function getAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || undefined
}

/** Model id or alias, e.g. claude-sonnet-4-5 */
export function getAnthropicClaudeModel(): string {
  return process.env.ANTHROPIC_CLAUDE_MODEL?.trim() || 'claude-sonnet-4-6'
}

export function textFromAnthropicMessage(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

export async function translateWithAnthropicClaude(
  text: string,
  targetLanguage: string,
  systemPrompt: string
): Promise<string> {
  const apiKey = getAnthropicApiKey()
  if (!apiKey) {
    throw new Error('Anthropic API key not found')
  }

  const client = new Anthropic({ apiKey })
  const message = await client.messages.create({
    model: getAnthropicClaudeModel(),
    max_tokens: 8192,
    temperature: 0.3,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Translate to ${targetLanguage}:\n${text}`,
      },
    ],
  })

  return textFromAnthropicMessage(message)
}
