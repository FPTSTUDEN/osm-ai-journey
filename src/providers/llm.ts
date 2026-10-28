export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type LlmConfig = {
  baseUrl: string
  model: string
  apiKey?: string
}

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function headers(config: LlmConfig): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  }
}

function providerError(status: number, payload: ChatCompletionResponse | null) {
  return payload?.error?.message ? `Provider error: ${payload.error.message}` : `Provider request failed (${status})`
}

export async function testLlmConnection(config: LlmConfig): Promise<void> {
  const response = await fetch(endpoint(config.baseUrl, '/models'), { headers: headers(config) })
  let payload: ChatCompletionResponse | null = null
  try { payload = await response.json() as ChatCompletionResponse } catch { /* Compatible servers may return an empty body. */ }
  if (!response.ok) throw new Error(providerError(response.status, payload))
}

export async function completeChat(config: LlmConfig, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const response = await fetch(endpoint(config.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ model: config.model, messages, stream: false }),
    signal,
  })
  let payload: ChatCompletionResponse | null = null
  try { payload = await response.json() as ChatCompletionResponse } catch { /* Handled by the empty-response error below. */ }
  if (!response.ok) throw new Error(providerError(response.status, payload))
  const content = payload?.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Provider returned no assistant message')
  return content
}
