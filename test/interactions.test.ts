import { describe, expect, it, vi } from 'vitest'
import type { CliOptions, V0Message } from '../src/types.js'
import type { Output } from '../src/ui/output.js'
import type { V0Client } from '../src/v0/client.js'
import { resolveInteractions } from '../src/v0/interactions.js'

function message(parts: V0Message['parts']): V0Message {
  return {
    chatId: 'chat_123',
    content: '',
    finishReason: 'stop',
    id: crypto.randomUUID(),
    parts,
    role: 'assistant',
  }
}

describe('resolveInteractions', () => {
  it('auto-approves an implementation plan only when --yes is set', async () => {
    const finished = message([])
    const resolveTask = vi.fn().mockResolvedValue(finished)
    const output = { spinner: vi.fn(), warn: vi.fn() } as unknown as Output

    const result = await resolveInteractions({
      chatUrl: 'https://v0.app/chat/chat_123',
      client: { resolveTask } as unknown as V0Client,
      cli: { nonInteractive: true, yes: true } as CliOptions,
      message: message([{ type: 'agent-action', name: 'exit_plan_mode' }]),
      output,
    })

    expect(result).toBe(finished)
    expect(resolveTask).toHaveBeenCalledWith('chat_123', {
      type: 'plan-exit-response',
      status: 'approved',
      content: 'Proceed with the implementation and verification.',
    })
  })

  it('leaves non-plan questions for the v0 web UI in non-interactive mode', async () => {
    const resolveTask = vi.fn()
    const warn = vi.fn()
    const pending = message([
      {
        type: 'agent-action',
        name: 'ask_user_questions',
        data: { questions: [{ id: 'q1', question: 'Which direction?' }] },
      },
    ])

    const result = await resolveInteractions({
      chatUrl: 'https://v0.app/chat/chat_123',
      client: { resolveTask } as unknown as V0Client,
      cli: { nonInteractive: true, yes: true } as CliOptions,
      message: pending,
      output: { warn } as unknown as Output,
    })

    expect(result).toBe(pending)
    expect(resolveTask).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('waiting for user input'))
  })
})
