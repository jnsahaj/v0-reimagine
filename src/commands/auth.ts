import {
  configDirectory,
  deleteCredential,
  resolveCredential,
} from '../auth/credentials.js'
import { login } from '../auth/login.js'
import { CliError } from '../errors.js'
import type { CliOptions } from '../types.js'
import type { Output } from '../ui/output.js'
import { V0Client } from '../v0/client.js'

export async function loginCommand(
  options: CliOptions,
  output: Output,
  version: string,
): Promise<void> {
  await login(options, output, version)
}

export async function logoutCommand(options: CliOptions, output: Output): Promise<void> {
  const deleted = await deleteCredential(configDirectory(options.globalConfig))
  if (deleted) output.success('Logged out')
  else output.info('No saved credentials found.')
}

export async function whoamiCommand(
  options: CliOptions,
  output: Output,
  version: string,
): Promise<void> {
  const credential = await resolveCredential({
    configDir: configDirectory(options.globalConfig),
    ...(options.token ? { token: options.token } : {}),
  })
  if (!credential) {
    throw new CliError('No v0 credentials found.', {
      hint: 'Set V0_API_KEY or run `v0-reimagine login`.',
    })
  }
  output.spinner('Validating v0 credentials…')
  await new V0Client({
    apiKey: credential.apiKey,
    baseUrl: options.apiUrl,
    debug: (message) => output.debug(message),
    version,
  }).validateCredentials()
  output.success(`Authenticated with ${credential.source} credentials`)
  if (options.format === 'json')
    output.json({ authenticated: true, source: credential.source })
}
