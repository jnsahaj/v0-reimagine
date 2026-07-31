import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Output } from '../src/ui/output.js'

describe('Output', () => {
  afterEach(() => vi.restoreAllMocks())

  it('aligns summary values into a consistent second column', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const output = new Output({ debug: false, format: 'human', noColor: true })

    output.table([
      { label: 'Project', value: 'tweakcn-next' },
      { label: 'Package manager', value: 'pnpm' },
      { detail: 'Existing GitHub repository', label: 'Source', value: 'GitHub' },
    ])

    expect(write.mock.calls.map(([value]) => value).join('')).toBe(
      '  Project          tweakcn-next\n' +
        '  Package manager  pnpm\n' +
        '  Source           GitHub\n' +
        '                   Existing GitHub repository\n\n',
    )
  })
})
