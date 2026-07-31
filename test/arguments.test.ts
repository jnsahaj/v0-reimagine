import { describe, expect, it } from 'vitest'
import { parseArguments } from '../src/cli/arguments.js'

describe('parseArguments', () => {
  it('treats free text as the prompt for the default command', () => {
    const options = parseArguments(['Make it', 'editorial', '--no-open'])

    expect(options.command).toBe('reimagine')
    expect(options.prompt).toBe('Make it editorial')
    expect(options.open).toBe(false)
    expect(options.source).toBe('auto')
    expect(options.model).toBe('v0-pro')
    expect(options.privacy).toBe('private')
  })

  it('supports Vercel-style aliases and explicit commands', () => {
    const options = parseArguments([
      'inspect',
      '-d',
      '-F',
      'json',
      '-S',
      'team_acme',
      '-T',
      'acme',
      '-y',
    ])

    expect(options).toMatchObject({
      command: 'inspect',
      debug: true,
      format: 'json',
      scope: 'team_acme',
      team: 'acme',
      yes: true,
    })
  })

  it('rejects invalid constrained values', () => {
    expect(() => parseArguments(['--source=dropbox'])).toThrow(
      'Invalid --source value "dropbox"',
    )
    expect(() => parseArguments(['--max-upload-mb=0'])).toThrow(
      '--max-upload-mb must be between 1 and 100',
    )
  })
})
