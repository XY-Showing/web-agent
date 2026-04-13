/**
 * OpenAI Chat Completions Fetch Adapter
 *
 * Intercepts fetch calls from the Anthropic SDK and routes them to any
 * OpenAI Chat Completions-compatible API endpoint, translating between
 * Anthropic Messages API format and OpenAI Chat Completions format.
 *
 * Compatible with: OpenAI, Ollama, Moonshot/Kimi, Qwen, Groq, Together,
 * LM Studio, and any other OpenAI Chat Completions-compatible service.
 */

import { OPENAI_DEFAULT_BASE_URL, OPENAI_DEFAULT_MODEL } from '../../constants/openai.js'

// ── Types ───────────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string | AnthropicContentBlock[]
  source?: { type: string; media_type: string; data: string }
  [key: string]: unknown
}

interface AnthropicMessage {
  role: string
  content: string | AnthropicContentBlock[]
}

interface AnthropicTool {
  name: string
  description?: string
  input_schema?: Record<string, unknown>
}

// ── Tool translation: Anthropic → OpenAI ────────────────────────────

function translateTools(anthropicTools: AnthropicTool[]): Array<Record<string, unknown>> {
  return anthropicTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} },
    },
  }))
}

// ── Message translation: Anthropic → OpenAI ─────────────────────────

function translateMessages(
  systemPrompt: string | Array<{ type: string; text?: string }> | undefined,
  anthropicMessages: AnthropicMessage[],
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = []

  // System prompt → OpenAI system message
  if (systemPrompt) {
    const systemText =
      typeof systemPrompt === 'string'
        ? systemPrompt
        : Array.isArray(systemPrompt)
          ? systemPrompt
              .filter(b => b.type === 'text' && typeof b.text === 'string')
              .map(b => b.text!)
              .join('\n')
          : ''
    if (systemText) {
      messages.push({ role: 'system', content: systemText })
    }
  }

  for (const msg of anthropicMessages) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content })
      continue
    }

    if (!Array.isArray(msg.content)) continue

    if (msg.role === 'user') {
      // Collect text/image blocks and tool_result blocks separately
      const contentParts: Array<Record<string, unknown>> = []
      const toolResults: Array<Record<string, unknown>> = []

      for (const block of msg.content) {
        if (block.type === 'tool_result') {
          let outputText = ''
          if (typeof block.content === 'string') {
            outputText = block.content
          } else if (Array.isArray(block.content)) {
            outputText = block.content
              .map(c => {
                if (c.type === 'text') return c.text
                if (c.type === 'image') return '[Image attached]'
                return ''
              })
              .join('\n')
          }
          toolResults.push({
            role: 'tool',
            tool_call_id: block.tool_use_id || '',
            content: outputText,
          })
        } else if (block.type === 'text' && typeof block.text === 'string') {
          contentParts.push({ type: 'text', text: block.text })
        } else if (block.type === 'image' && block.source?.type === 'base64') {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          })
        }
      }

      // Tool results are emitted as separate messages
      if (toolResults.length > 0) {
        messages.push(...toolResults)
      }

      // User content
      if (contentParts.length > 0) {
        if (contentParts.length === 1 && contentParts[0].type === 'text') {
          messages.push({ role: 'user', content: contentParts[0].text })
        } else {
          messages.push({ role: 'user', content: contentParts })
        }
      }
    } else if (msg.role === 'assistant') {
      // Separate text and tool_use blocks
      let textContent = ''
      const toolCalls: Array<Record<string, unknown>> = []

      for (const block of msg.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          textContent += block.text
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id || `call_${Date.now()}`,
            type: 'function',
            function: {
              name: block.name || '',
              arguments: JSON.stringify(block.input || {}),
            },
          })
        }
      }

      const assistantMsg: Record<string, unknown> = { role: 'assistant' }
      if (textContent) assistantMsg.content = textContent
      if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls
      messages.push(assistantMsg)
    }
  }

  return messages
}

// ── SSE helpers ──────────────────────────────────────────────────────

function formatSSE(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`
}

// ── Response translation: OpenAI Chat Completions SSE → Anthropic SSE ─

async function translateChatCompletionsStream(
  openaiResponse: Response,
  model: string,
): Promise<Response> {
  const messageId = `msg_openai_${Date.now()}`

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let contentBlockIndex = 0
      let inputTokens = 0
      let outputTokens = 0
      let hadToolCalls = false

      // Track text and tool_call state across chunks
      let textBlockOpen = false
      // Map from tool call index → { id, name, blockIndex }
      const toolCallBlocks: Map<number, { id: string; name: string; blockIndex: number }> =
        new Map()

      // Emit message_start
      controller.enqueue(
        encoder.encode(
          formatSSE(
            'message_start',
            JSON.stringify({
              type: 'message_start',
              message: {
                id: messageId,
                type: 'message',
                role: 'assistant',
                content: [],
                model,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
            }),
          ),
        ),
      )

      controller.enqueue(
        encoder.encode(formatSSE('ping', JSON.stringify({ type: 'ping' }))),
      )

      try {
        const reader = openaiResponse.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed === 'data: [DONE]') continue
            if (!trimmed.startsWith('data: ')) continue

            let chunk: Record<string, unknown>
            try {
              chunk = JSON.parse(trimmed.slice(6))
            } catch {
              continue
            }

            const choices = chunk.choices as Array<Record<string, unknown>> | undefined
            if (!choices || choices.length === 0) {
              // May be a usage-only chunk
              const usage = chunk.usage as Record<string, number> | undefined
              if (usage) {
                inputTokens = usage.prompt_tokens || inputTokens
                outputTokens = usage.completion_tokens || outputTokens
              }
              continue
            }

            const choice = choices[0] as Record<string, unknown>
            const delta = choice.delta as Record<string, unknown> | undefined
            const finishReason = choice.finish_reason as string | null

            if (!delta) continue

            // ── Text content ─────────────────────────────────────
            const text = delta.content as string | null
            if (typeof text === 'string' && text.length > 0) {
              if (!textBlockOpen) {
                controller.enqueue(
                  encoder.encode(
                    formatSSE(
                      'content_block_start',
                      JSON.stringify({
                        type: 'content_block_start',
                        index: contentBlockIndex,
                        content_block: { type: 'text', text: '' },
                      }),
                    ),
                  ),
                )
                textBlockOpen = true
              }
              controller.enqueue(
                encoder.encode(
                  formatSSE(
                    'content_block_delta',
                    JSON.stringify({
                      type: 'content_block_delta',
                      index: contentBlockIndex,
                      delta: { type: 'text_delta', text },
                    }),
                  ),
                ),
              )
            }

            // ── Tool calls ───────────────────────────────────────
            const toolCallDeltas = delta.tool_calls as
              | Array<Record<string, unknown>>
              | undefined
            if (toolCallDeltas) {
              // Close text block if open
              if (textBlockOpen) {
                controller.enqueue(
                  encoder.encode(
                    formatSSE(
                      'content_block_stop',
                      JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
                    ),
                  ),
                )
                contentBlockIndex++
                textBlockOpen = false
              }

              for (const toolCallDelta of toolCallDeltas) {
                const idx = toolCallDelta.index as number
                const fn = toolCallDelta.function as Record<string, unknown> | undefined

                if (!toolCallBlocks.has(idx)) {
                  // First chunk for this tool call — open a new block
                  const toolId =
                    (toolCallDelta.id as string) || `call_${Date.now()}_${idx}`
                  const toolName = (fn?.name as string) || ''
                  toolCallBlocks.set(idx, {
                    id: toolId,
                    name: toolName,
                    blockIndex: contentBlockIndex,
                  })
                  hadToolCalls = true

                  controller.enqueue(
                    encoder.encode(
                      formatSSE(
                        'content_block_start',
                        JSON.stringify({
                          type: 'content_block_start',
                          index: contentBlockIndex,
                          content_block: {
                            type: 'tool_use',
                            id: toolId,
                            name: toolName,
                            input: {},
                          },
                        }),
                      ),
                    ),
                  )
                  contentBlockIndex++
                }

                // Emit argument delta
                const argsDelta = fn?.arguments as string | undefined
                if (typeof argsDelta === 'string' && argsDelta.length > 0) {
                  const block = toolCallBlocks.get(idx)!
                  controller.enqueue(
                    encoder.encode(
                      formatSSE(
                        'content_block_delta',
                        JSON.stringify({
                          type: 'content_block_delta',
                          index: block.blockIndex,
                          delta: { type: 'input_json_delta', partial_json: argsDelta },
                        }),
                      ),
                    ),
                  )
                }
              }
            }

            // ── Finish ───────────────────────────────────────────
            if (finishReason) {
              // Close open text block
              if (textBlockOpen) {
                controller.enqueue(
                  encoder.encode(
                    formatSSE(
                      'content_block_stop',
                      JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
                    ),
                  ),
                )
                contentBlockIndex++
                textBlockOpen = false
              }

              // Close open tool call blocks
              for (const [, block] of toolCallBlocks) {
                controller.enqueue(
                  encoder.encode(
                    formatSSE(
                      'content_block_stop',
                      JSON.stringify({
                        type: 'content_block_stop',
                        index: block.blockIndex,
                      }),
                    ),
                  ),
                )
              }
              toolCallBlocks.clear()
            }

            // Collect usage if present in this chunk
            const usage = chunk.usage as Record<string, number> | undefined
            if (usage) {
              inputTokens = usage.prompt_tokens || inputTokens
              outputTokens = usage.completion_tokens || outputTokens
            }
          }
        }
      } catch (err) {
        // Emit error as text if something goes wrong mid-stream
        if (!textBlockOpen) {
          controller.enqueue(
            encoder.encode(
              formatSSE(
                'content_block_start',
                JSON.stringify({
                  type: 'content_block_start',
                  index: contentBlockIndex,
                  content_block: { type: 'text', text: '' },
                }),
              ),
            ),
          )
          textBlockOpen = true
        }
        controller.enqueue(
          encoder.encode(
            formatSSE(
              'content_block_delta',
              JSON.stringify({
                type: 'content_block_delta',
                index: contentBlockIndex,
                delta: { type: 'text_delta', text: `\n\n[Error: ${String(err)}]` },
              }),
            ),
          ),
        )
      }

      // Close any remaining open blocks
      if (textBlockOpen) {
        controller.enqueue(
          encoder.encode(
            formatSSE(
              'content_block_stop',
              JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
            ),
          ),
        )
      }

      // message_delta with stop_reason
      controller.enqueue(
        encoder.encode(
          formatSSE(
            'message_delta',
            JSON.stringify({
              type: 'message_delta',
              delta: {
                stop_reason: hadToolCalls ? 'tool_use' : 'end_turn',
                stop_sequence: null,
              },
              usage: { output_tokens: outputTokens },
            }),
          ),
        ),
      )

      // message_stop
      controller.enqueue(
        encoder.encode(
          formatSSE(
            'message_stop',
            JSON.stringify({
              type: 'message_stop',
              usage: { input_tokens: inputTokens, output_tokens: outputTokens },
            }),
          ),
        ),
      )

      controller.close()
    },
  })

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'x-request-id': messageId,
    },
  })
}

// ── Main fetch interceptor ──────────────────────────────────────────

/**
 * Creates a fetch function that intercepts Anthropic SDK calls and routes
 * them to any OpenAI Chat Completions-compatible API endpoint.
 *
 * @param apiKey - API key for the target service
 * @param baseURL - Base URL of the OpenAI-compatible endpoint (without trailing slash)
 * @param model - Model ID to use (e.g. 'gpt-4o', 'moonshot-v1-8k')
 */
export function createOpenAIFetch(
  apiKey: string,
  baseURL: string,
  model: string,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input)

    // Only intercept Anthropic Messages API calls
    if (!url.includes('/v1/messages')) {
      return globalThis.fetch(input, init)
    }

    // Parse the Anthropic request body
    let anthropicBody: Record<string, unknown>
    try {
      const bodyText =
        init?.body instanceof ReadableStream
          ? await new Response(init.body).text()
          : typeof init?.body === 'string'
            ? init.body
            : '{}'
      anthropicBody = JSON.parse(bodyText)
    } catch {
      anthropicBody = {}
    }

    const anthropicMessages = (anthropicBody.messages || []) as AnthropicMessage[]
    const systemPrompt = anthropicBody.system as
      | string
      | Array<{ type: string; text?: string }>
      | undefined
    const anthropicTools = (anthropicBody.tools || []) as AnthropicTool[]
    const maxTokens = anthropicBody.max_tokens as number | undefined

    // Build Chat Completions request body
    const chatBody: Record<string, unknown> = {
      model,
      messages: translateMessages(systemPrompt, anthropicMessages),
      stream: true,
      stream_options: { include_usage: true },
    }

    if (maxTokens) chatBody.max_tokens = maxTokens
    if (anthropicTools.length > 0) {
      chatBody.tools = translateTools(anthropicTools)
      chatBody.tool_choice = 'auto'
    }

    // Call the OpenAI-compatible endpoint
    const endpoint = `${baseURL.replace(/\/$/, '')}/chat/completions`
    const openaiResponse = await globalThis.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(chatBody),
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      return new Response(
        JSON.stringify({
          type: 'error',
          error: {
            type: 'api_error',
            message: `OpenAI API error (${openaiResponse.status}): ${errorText}`,
          },
        }),
        { status: openaiResponse.status, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return translateChatCompletionsStream(openaiResponse, model)
  }
}

// Re-export constants for convenience
export { OPENAI_DEFAULT_BASE_URL, OPENAI_DEFAULT_MODEL }
