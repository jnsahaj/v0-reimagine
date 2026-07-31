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
      const bodyBytes = body ? Buffer.byteLength(body) : 0
      this.#debug(
        `${method} ${path} (attempt ${attempt + 1}${body ? `, ${bodyBytes} byte body` : ''})`,
      )
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
      throw await apiError(response, this.#debug)
    }

    throw new CliError('v0 request failed after retrying.')
  }
}

async function apiError(
  response: Response,
  debug: (message: string) => void,
): Promise<CliError> {
  const payload = (await response.json().catch(() => null)) as unknown
  const summary = summarizeApiError(payload)
  const message =
    summary.message ?? `v0 API request failed with status ${response.status}.`
  debug(
    `v0 error response: HTTP ${response.status}${summary.code ? `, code ${summary.code}` : ''}${summary.details.length ? `, ${summary.details.join('; ')}` : ''}`,
  )
  const hint =
    response.status === 401
      ? 'Run `v0-reimagine login` or set V0_API_KEY to a valid key.'
      : response.status === 403
        ? 'Confirm the API key belongs to a v0 Plus, Premium, or eligible team account.'
        : response.status === 422
          ? summary.details.join('\n') ||
            'v0 rejected the request parameters. Retry with --debug for endpoint and request-size diagnostics.'
          : undefined
  return new CliError(message, {
    ...(summary.code ? { code: summary.code } : {}),
    ...(hint ? { hint } : {}),
    statusCode: response.status,
  })
}

function summarizeApiError(payload: unknown): {
  code?: string
  details: string[]
  message?: string
} {
  if (!isRecord(payload)) return { details: [] }
  const error = isRecord(payload.error) ? payload.error : undefined
  const message = firstString(
    error?.userMessage,
    error?.message,
    typeof payload.error === 'string' ? payload.error : undefined,
    payload.message,
  )
  const code = firstString(error?.code, payload.code)
  const details: string[] = []
  for (const source of [
    payload.detail,
    payload.details,
    payload.issues,
    payload.errors,
    error?.details,
  ]) {
    collectValidationDetails(source, details)
  }
  return {
    ...(code ? { code: sanitizeApiText(code) } : {}),
    details: [...new Set(details)].slice(0, 5),
    ...(message ? { message: sanitizeApiText(message) } : {}),
  }
}

function collectValidationDetails(value: unknown, output: string[], depth = 0): void {
  if (value === undefined || value === null || depth > 3 || output.length >= 5) return
  if (typeof value === 'string') {
    output.push(sanitizeApiText(value))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectValidationDetails(item, output, depth + 1)
    return
  }
  if (!isRecord(value)) return
  const detail = firstString(value.msg, value.message, value.reason)
  if (detail) {
    const location = Array.isArray(value.loc)
      ? value.loc.filter((part) => typeof part === 'string' || typeof part === 'number')
      : Array.isArray(value.path)
        ? value.path.filter(
            (part) => typeof part === 'string' || typeof part === 'number',
          )
        : []
    output.push(
      sanitizeApiText(`${location.length ? `${location.join('.')}: ` : ''}${detail}`),
    )
    return
  }
  for (const key of ['detail', 'details', 'issues', 'errors']) {
    collectValidationDetails(value[key], output, depth + 1)
  }
}

function sanitizeApiText(value: string): string {
  return value
    .replace(/data:[^;\s]+;base64,[A-Za-z0-9+/=]+/g, '[data URL omitted]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[credential redacted]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[credential redacted]')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, '[credential redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
