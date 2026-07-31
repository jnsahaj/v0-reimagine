import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  deleteCredential,
  readSavedCredential,
  resolveCredential,
  saveCredential,
} from '../src/auth/credentials.js'

describe('credentials', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('saves credentials privately and can delete them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v0-reimagine-auth-'))
    const config = join(root, 'config')
    await saveCredential(config, 'v0_test_key')

    expect(await readSavedCredential(config)).toBe('v0_test_key')
    expect((await stat(config)).mode & 0o777).toBe(0o700)
    expect((await stat(join(config, 'auth.json'))).mode & 0o777).toBe(0o600)
    expect(await deleteCredential(config)).toBe(true)
    expect(await deleteCredential(config)).toBe(false)
  })

  it('uses flag, environment, then saved credential precedence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v0-reimagine-precedence-'))
    await saveCredential(root, 'saved')
    vi.stubEnv('V0_API_KEY', 'environment')

    await expect(resolveCredential({ configDir: root, token: 'flag' })).resolves.toEqual({
      apiKey: 'flag',
      source: 'flag',
    })
    await expect(resolveCredential({ configDir: root })).resolves.toEqual({
      apiKey: 'environment',
      source: 'env',
    })
  })
})
