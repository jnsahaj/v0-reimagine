import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseSse, V0Client } from '../src/v0/client.js'

const metric = { cacheRead: 0, cacheWrite: 0, input: 1, output: 2, total: 3 }
const usage = { creditsCost: metric, tokens: metric }
const chat = {
  authorId: 'user_123',
  createdAt: '2026-01-01T00:00:00.000Z',
  id: 'chat_123',
  metadata: {},
  privacy: 'private',
  writePermission: true,
}

describe('V0Client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates a chat from a GitHub repository with authenticated v2 requests', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ chat, usage }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', request)
    const client = new V0Client({
      apiKey: 'v0_test',
      baseUrl: 'https://api.v0.dev/v2/',
      version: '0.1.0',
    })

    await expect(
      client.createFromRepo(
        { url: 'https://github.com/acme/site', branch: 'main' },
        { metadata: { tool: 'v0-reimagine' }, privacy: 'private', title: 'Site' },
      ),
    ).resolves.toMatchObject({ chat: { id: 'chat_123' } })

    const [url, init] = request.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.v0.dev/v2/chats/from-repo')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer v0_test',
      'User-Agent': 'v0-reimagine/0.1.0',
    })
    expect(JSON.parse(String(init.body))).toMatchObject({
      repo: { url: 'https://github.com/acme/site', branch: 'main' },
      privacy: 'private',
    })
  })

  it('surfaces authentication guidance for unauthorized credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
          status: 401,
        }),
      ),
    )
    const client = new V0Client({
      apiKey: 'bad',
      baseUrl: 'https://api.v0.dev/v2',
      version: '0.1.0',
    })

    await expect(client.validateCredentials()).rejects.toMatchObject({
      message: 'Unauthorized',
      hint: expect.stringContaining('v0-reimagine login'),
    })
  })

  it('surfaces safe validation details for rejected uploads', async () => {
    const debug = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'validation_failed' },
            detail: [{ loc: ['body', 'files'], msg: 'At most 1000 files are supported' }],
          }),
          { status: 422 },
        ),
      ),
    )
    const client = new V0Client({
      apiKey: 'v0_test',
      baseUrl: 'https://api.v0.dev/v2',
      debug,
      version: '0.1.0',
    })

    await expect(client.createFromFiles([], importOptions())).rejects.toMatchObject({
      code: 'validation_failed',
      hint: 'body.files: At most 1000 files are supported',
      statusCode: 422,
    })
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('HTTP 422'))
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('byte body'))
  })
})

describe('parseSse', () => {
  it('parses multiline event data and ignores the done marker', async () => {
    const response = new Response(
      'event: message\ndata: {"object":"thinking",\ndata: "step":1}\n\ndata: [DONE]\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
    const events = []
    for await (const event of parseSse(response)) events.push(event)

    expect(events).toEqual([{ object: 'thinking', step: 1 }])
  })
})

function importOptions() {
  return { metadata: {}, privacy: 'private' as const, title: 'Site' }
}
