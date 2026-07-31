import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'

const authSchema = z.object({ apiKey: z.string().min(1) })

export interface Credential {
  apiKey: string
  source: 'flag' | 'env' | 'saved'
}

export function configDirectory(override?: string): string {
  if (override) return resolve(override)
  if (process.env.V0_REIMAGINE_CONFIG_DIR)
    return resolve(process.env.V0_REIMAGINE_CONFIG_DIR)
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(configHome, 'v0-reimagine')
}

export async function deleteCredential(configDir: string): Promise<boolean> {
  try {
    await unlink(authPath(configDir))
    return true
  } catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
}

export async function readSavedCredential(
  configDir: string,
): Promise<string | undefined> {
  try {
    const parsed = authSchema.safeParse(
      JSON.parse(await readFile(authPath(configDir), 'utf8')),
    )
    return parsed.success ? parsed.data.apiKey : undefined
  } catch (error) {
    if (isNotFound(error) || error instanceof SyntaxError) return undefined
    throw error
  }
}

export async function resolveCredential(options: {
  configDir: string
  token?: string
}): Promise<Credential | undefined> {
  if (options.token) return { apiKey: options.token, source: 'flag' }
  if (process.env.V0_API_KEY) return { apiKey: process.env.V0_API_KEY, source: 'env' }
  const saved = await readSavedCredential(options.configDir)
  return saved ? { apiKey: saved, source: 'saved' } : undefined
}

export async function saveCredential(configDir: string, apiKey: string): Promise<void> {
  const file = authPath(configDir)
  await mkdir(dirname(file), { recursive: true, mode: 0o700 })
  await chmod(dirname(file), 0o700)
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify({ apiKey }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  await rename(temporary, file)
  await chmod(file, 0o600)
}

function authPath(configDir: string): string {
  return join(configDir, 'auth.json')
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
