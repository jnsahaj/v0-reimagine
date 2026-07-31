import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CliOptions, ProjectContext, V0Message } from '../src/types.js'
import type { Output } from '../src/ui/output.js'
import { runReimagination } from '../src/v0/orchestrate.js'

const metric = { cacheRead: 0, cacheWrite: 0, input: 1, output: 2, total: 3 }
const usage = { creditsCost: metric, tokens: metric }
const chat = {
  authorId: 'user_123',
  createdAt: '2026-01-01T00:00:00.000Z',
  id: 'chat_123',
  metadata: {},
  privacy: 'private' as const,
  vercelProjectId: 'prj_v0',
  webUrl: 'https://v0.app/chat/chat_123',
  writePermission: true,
}

function assistant(
  id: string,
  parts: V0Message['parts'],
  finishReason = 'tool-calls',
): V0Message {
  return {
    chatId: chat.id,
    content: '',
    finishReason,
    id,
    parts,
    role: 'assistant',
  }
}

function sse(message: V0Message): Response {
  return new Response(`data: ${JSON.stringify(message)}`, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('runReimagination', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('auto-resolves plan mode and returns only after application edits exist', async () => {
    const plan = assistant('message_plan', [
      { type: 'file-edit', path: 'v0_plans/pragmatic-guide.md' },
      { type: 'agent-action', name: 'exit_plan_mode', data: { plan: 'Polish it' } },
    ])
    const implemented = assistant(
      'message_done',
      [{ type: 'file-edit', path: 'app/page.tsx' }],
      'stop',
    )
    const requests: Array<{ body?: Record<string, unknown>; url: string }> = []
    const sequence: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (urlValue: string | URL | Request, init?: RequestInit) => {
        const url = String(urlValue)
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined
        requests.push({ ...(body ? { body } : {}), url })
        if (url.endsWith('/chats/from-repo')) {
          sequence.push('chat-created')
          return new Response(JSON.stringify({ chat, usage }), { status: 200 })
        }
        if (url.endsWith('/messages/stream')) {
          sequence.push('generation-started')
          return sse(plan)
        }
        if (url.endsWith('/messages/resolve'))
          return new Response(JSON.stringify(implemented), { status: 200 })
        if (url.endsWith(`/chats/${chat.id}`))
          return new Response(JSON.stringify(chat), { status: 200 })
        throw new Error(`Unexpected request: ${url}`)
      }),
    )
    const info = vi.fn()
    const warn = vi.fn()

    const result = await runReimagination({
      apiKey: 'v0_test',
      cli: cliOptions(),
      onChatCreated: () => {
        sequence.push('browser-opened')
      },
      output: {
        debug: vi.fn(),
        info,
        spinner: vi.fn(),
        spinnerText: vi.fn(),
        stopSpinner: vi.fn(),
        success: vi.fn(),
        warn,
      } as unknown as Output,
      prepared: {
        project: projectContext(),
        selected: {
          reason: 'GitHub repository detected.',
          type: 'github',
        },
      },
      version: '0.1.2',
    })

    expect(result.message).toEqual(implemented)
    expect(sequence).toEqual(['chat-created', 'browser-opened', 'generation-started'])
    expect(
      requests.find((request) => request.url.endsWith('/messages/resolve'))?.body,
    ).toMatchObject({
      modelConfiguration: { imageGenerations: false, modelId: 'v0-pro' },
      task: { status: 'approved', type: 'plan-exit-response' },
    })
    expect(
      requests.filter((request) => request.url.endsWith('/messages/stream')),
    ).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith(expect.stringContaining('was not modified'))
  })

  it('prompts once more when the first response contains no implementation', async () => {
    const explanation = assistant('message_explanation', [
      { type: 'text', text: 'Ready' },
    ])
    const implemented = assistant(
      'message_done',
      [{ type: 'file-edit', path: 'components/header.tsx' }],
      'stop',
    )
    const requests: Array<{ body?: Record<string, unknown>; url: string }> = []
    let streamCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (urlValue: string | URL | Request, init?: RequestInit) => {
        const url = String(urlValue)
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined
        requests.push({ ...(body ? { body } : {}), url })
        if (url.endsWith('/chats/from-repo'))
          return new Response(JSON.stringify({ chat, usage }), { status: 200 })
        if (url.endsWith('/messages/stream')) {
          streamCount += 1
          return sse(streamCount === 1 ? explanation : implemented)
        }
        if (url.endsWith(`/chats/${chat.id}`))
          return new Response(JSON.stringify(chat), { status: 200 })
        throw new Error(`Unexpected request: ${url}`)
      }),
    )

    const result = await runReimagination({
      apiKey: 'v0_test',
      cli: cliOptions(),
      output: outputMock(),
      prepared: {
        project: projectContext(),
        selected: { reason: 'GitHub repository detected.', type: 'github' },
      },
      version: '0.1.2',
    })

    expect(result.message).toEqual(implemented)
    const streams = requests.filter((request) => request.url.endsWith('/messages/stream'))
    expect(streams).toHaveLength(2)
    expect(streams[1]?.body?.message).toEqual(
      expect.stringContaining('Implement the reimagination now'),
    )
  })
})

function outputMock(): Output {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    spinner: vi.fn(),
    spinnerText: vi.fn(),
    stopSpinner: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  } as unknown as Output
}

function cliOptions(): CliOptions {
  return {
    apiUrl: 'https://api.v0.dev/v2',
    command: 'reimagine',
    cwd: '/tmp/site',
    debug: false,
    dryRun: false,
    format: 'human',
    help: false,
    imageGenerations: false,
    maxUploadMb: 50,
    model: 'v0-pro',
    noColor: true,
    nonInteractive: true,
    open: false,
    privacy: 'private',
    source: 'auto',
    version: false,
    yes: false,
  }
}

function projectContext(): ProjectContext {
  return {
    cwd: '/tmp/site',
    framework: 'Next.js',
    git: {
      ahead: 0,
      branch: 'main',
      clean: true,
      githubUrl: 'https://github.com/acme/site',
      repositoryRoot: '/tmp/site',
    },
    name: 'site',
    packageManager: 'pnpm',
    projectRoot: '/tmp/site',
    vercel: {
      projectId: 'prj_local',
      source: 'project-json',
      verified: true,
    },
  }
}
