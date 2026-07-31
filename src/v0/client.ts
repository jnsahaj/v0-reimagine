import { setTimeout as delay } from 'node:timers/promises'
import type { z } from 'zod'
import { CliError } from '../errors.js'
import type { ModelId, Privacy, Usage, V0Chat, V0Message } from '../types.js'
import {
  chatListSchema,
  chatSchema,
  importResponseSchema,
  messageSchema,
} from './schemas.js'

export interface V0ClientOptions {
  apiKey: string
  baseUrl: string
  debug?: (message: string) => void
  version: string
}

interface RequestOptions {
  body?: unknown
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  retries?: number
  schema?: z.ZodType
  stream?: boolean
}

interface ImportOptions {
  metadata: Record<string, string>
  privacy: Privacy
  title: string
}

export interface StreamResult {
  finalMessage?: V0Message
  usage?: Usage
}

export class V0Client {
  readonly #apiKey: string
  readonly #baseUrl: string
  readonly #debug: (message: string) => void
  readonly #version: string

  constructor(options: V0ClientOptions) {
    this.#apiKey = options.apiKey
    this.#baseUrl = options.baseUrl.replace(/\/$/, '')
    this.#debug = options.debug ?? (() => {})
    this.#version = options.version
  }

  async createFromFiles(
    files: Array<{ content: string; name: string }>,
    options: ImportOptions,
  ): Promise<{ chat: V0Chat; usage: Usage }> {
    return this.request('/chats/from-files', {
      method: 'POST',
      body: { files, ...options },
      schema: importResponseSchema,
    })
  }

  async createFromRepo(
    repo: { branch?: string; url: string },
    options: ImportOptions,
  ): Promise<{ chat: V0Chat; usage: Usage }> {
    return this.request('/chats/from-repo', {
      method: 'POST',
      body: { repo, ...options },
      schema: importResponseSchema,
    })
  }

  async createFromZip(
    url: string,
    options: ImportOptions,
  ): Promise<{ chat: V0Chat; usage: Usage }> {
    return this.request('/chats/from-zip', {
      method: 'POST',
      body: { url, ...options },
      schema: importResponseSchema,
    })
  }

  async getChat(chatId: string): Promise<V0Chat> {
    return this.request(`/chats/${encodeURIComponent(chatId)}`, { schema: chatSchema })
  }

  async resolveTask(chatId: string, task: Record<string, unknown>): Promise<V0Message> {
    return this.request(`/chats/${encodeURIComponent(chatId)}/messages/resolve`, {
      method: 'POST',
      body: { task },
      schema: messageSchema,
    })
  }

  async sendMessageStream(
    chatId: string,
    input: {
      imageGenerations: boolean
      message: string
      model: ModelId
      systemPrompt: string
    },
    onEvent?: (event: Record<string, unknown>) => void,
  ): Promise<StreamResult> {
    const response = await this.rawRequest(
      `/chats/${encodeURIComponent(chatId)}/messages/stream`,
      {
        method: 'POST',
        body: {
          message: input.message,
          systemPrompt: input.systemPrompt,
          modelConfiguration: {
            modelId: input.model,
            imageGenerations: input.imageGenerations,
          },
        },
        stream: true,
      },
    )

    let finalMessage: V0Message | undefined
    let usage: Usage | undefined
    for await (const event of parseSse(response)) {
      onEvent?.(event)
      if (event.object === 'error') {
        throw new CliError(String(event.message ?? 'v0 stream failed.'))
      }
      if (event.object === 'message.usage' && event.usage) {
        usage = event.usage as Usage
      }
      if (event.object === 'message' || event.role === 'assistant') {
        const parsed = messageSchema.safeParse(event)
        if (parsed.success && parsed.data.finishReason !== null)
          finalMessage = parsed.data
      }
    }

    return {
      ...(finalMessage ? { finalMessage } : {}),
      ...(usage ? { usage } : {}),
    }
  }

  async validateCredentials(): Promise<void> {
    await this.request('/chats?limit=1', { schema: chatListSchema })
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.rawRequest(path, options)
    const data = await response.json().catch(() => {
      throw new CliError('v0 returned an invalid JSON response.')
    })
    if (!options.schema) return data as T
    const parsed = options.schema.safeParse(data)
    if (!parsed.success) {
      this.#debug(parsed.error.message)
      throw new CliError('v0 returned an unexpected response shape.', {
        hint: 'Retry with --debug and report the response-shape error.',
      })
    }
    return parsed.data as T
  }

  private async rawRequest(path: string, options: RequestOptions): Promise<Response> {
    const method = options.method ?? 'GET'
    const body = options.body === undefined ? undefined : JSON.stringify(options.body)
    const retries = options.retries ?? 3

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      this.#debug(`${method} ${path} (attempt ${attempt + 1})`)
      let response: Response
      try {
        response = await fetch(`${this.#baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.#apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': `v0-reimagine/${this.#version}`,
          },
          ...(body ? { body } : {}),
        })
      } catch (error) {
        if (attempt < retries) {
          await delay(500 * 2 ** attempt)
          continue
        }
        throw new CliError(
          `Unable to reach v0: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      if (response.ok) return response
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        const retryAfter = Number(response.headers.get('retry-after'))
        await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * 2 ** attempt)
        continue
      }
      throw await apiError(response)
    }

    throw new CliError('v0 request failed after retrying.')
  }
}

async function apiError(response: Response): Promise<CliError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string; userMessage?: string }
    message?: string
  } | null
  const message =
    payload?.error?.userMessage ??
    payload?.error?.message ??
    payload?.message ??
    `v0 API request failed with status ${response.status}.`
  const hint =
    response.status === 401
      ? 'Run `v0-reimagine login` or set V0_API_KEY to a valid key.'
      : response.status === 403
        ? 'Confirm the API key belongs to a v0 Plus, Premium, or eligible team account.'
        : undefined
  return new CliError(message, { ...(hint ? { hint } : {}) })
}

export async function* parseSse(
  response: Response,
): AsyncGenerator<Record<string, unknown>> {
  if (!response.body) throw new CliError('v0 returned an empty event stream.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const chunks = buffer.split(/\r?\n\r?\n/)
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const data = chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (!data || data === '[DONE]') continue
      try {
        yield JSON.parse(data) as Record<string, unknown>
      } catch {
        // Ignore keepalive or forward-compatible non-JSON events.
      }
    }
    if (done) break
  }
}
