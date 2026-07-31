import password from '@inquirer/password'
import open from 'open'
import { CliError } from '../errors.js'
import type { CliOptions } from '../types.js'
import type { Output } from '../ui/output.js'
import { V0Client } from '../v0/client.js'
import { configDirectory, resolveCredential, saveCredential } from './credentials.js'

const KEY_URL = 'https://v0.app/settings/keys'

export async function requireApiKey(
  options: CliOptions,
  output: Output,
  version: string,
): Promise<string> {
  const configDir = configDirectory(options.globalConfig)
  const existing = await resolveCredential({
    configDir,
    ...(options.token ? { token: options.token } : {}),
  })
  if (existing) {
    output.debug(`Using ${existing.source} v0 credential.`)
    return existing.apiKey
  }
  if (options.nonInteractive) {
    throw new CliError('No v0 credentials found.', {
      hint: 'Set V0_API_KEY or run `v0-reimagine login` in an interactive terminal.',
    })
  }
  output.info('No existing credentials found. Please log in:')
  return login(options, output, version)
}

export async function login(
  options: CliOptions,
  output: Output,
  version: string,
): Promise<string> {
  if (options.nonInteractive && !options.token && !process.env.V0_API_KEY) {
    throw new CliError('Login requires an interactive terminal or V0_API_KEY.')
  }

  let apiKey = options.token ?? process.env.V0_API_KEY
  if (!apiKey) {
    output.info(`Opening ${KEY_URL}`)
    await open(KEY_URL).catch(() => undefined)
    apiKey = await password({
      message: 'Paste your v0 API key',
      mask: '*',
      validate: (value) => value.trim().length > 0 || 'Enter a v0 API key.',
    })
  }
  apiKey = apiKey.trim()

  output.spinner('Validating v0 credentials…')
  const client = new V0Client({
    apiKey,
    baseUrl: options.apiUrl,
    debug: (message) => output.debug(message),
    version,
  })
  await client.validateCredentials()
  if (!options.token && !process.env.V0_API_KEY) {
    await saveCredential(configDirectory(options.globalConfig), apiKey)
    output.success('Authentication complete')
  } else {
    output.success('Credentials are valid')
  }
  return apiKey
}
