import { resolve } from 'node:path'
import process from 'node:process'
import arg from 'arg'
import { CliError } from '../errors.js'
import type { CliOptions, ModelId, OutputFormat, Privacy, SourceMode } from '../types.js'

const commands = new Set([
  'reimagine',
  'login',
  'logout',
  'whoami',
  'inspect',
  'doctor',
  'help',
])
const models = new Set<ModelId>(['v0-mini', 'v0-pro', 'v0-max', 'v0-max-fast'])
const privacyValues = new Set<Privacy>([
  'public',
  'private',
  'team',
  'team-edit',
  'unlisted',
])
const sourceValues = new Set<SourceMode>(['auto', 'github', 'local'])

export function parseArguments(argv: string[]): CliOptions {
  let parsed: ReturnType<typeof parseRawArguments>
  try {
    parsed = parseRawArguments(argv)
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error), {
      exitCode: 2,
    })
  }

  const positionals = [...parsed._]
  const candidate = positionals[0]
  const command = candidate && commands.has(candidate) ? positionals.shift() : 'reimagine'
  const format = stringValue(parsed['--format'] ?? 'human', '--format') as OutputFormat
  const model = stringValue(parsed['--model'] ?? 'v0-pro', '--model') as ModelId
  const privacy = stringValue(parsed['--privacy'] ?? 'private', '--privacy') as Privacy
  const source = stringValue(parsed['--source'] ?? 'auto', '--source') as SourceMode

  if (format !== 'human' && format !== 'json') invalid('--format', format, 'human, json')
  if (!models.has(model)) invalid('--model', model, [...models].join(', '))
  if (!privacyValues.has(privacy))
    invalid('--privacy', privacy, [...privacyValues].join(', '))
  if (!sourceValues.has(source)) invalid('--source', source, [...sourceValues].join(', '))

  const maxUploadMb = numberValue(parsed['--max-upload-mb'] ?? 50, '--max-upload-mb')
  if (maxUploadMb <= 0 || maxUploadMb > 100) {
    throw new CliError('--max-upload-mb must be between 1 and 100.', { exitCode: 2 })
  }

  const nonInteractive =
    booleanValue(parsed['--non-interactive']) ||
    !process.stdin.isTTY ||
    Boolean(process.env.CI || process.env.CODEX_THREAD_ID || process.env.CLAUDECODE)
  const shouldOpen =
    !booleanValue(parsed['--no-open']) &&
    (booleanValue(parsed['--open']) || (!nonInteractive && format === 'human'))

  return {
    apiUrl: stringValue(
      parsed['--api'] ?? process.env.V0_API_URL ?? 'https://api.v0.dev/v2',
      '--api',
    ).replace(/\/$/, ''),
    command: command as CliOptions['command'],
    cwd: resolve(stringValue(parsed['--cwd'] ?? process.cwd(), '--cwd')),
    debug: booleanValue(parsed['--debug']),
    dryRun: booleanValue(parsed['--dry-run']),
    format,
    ...(parsed['--global-config']
      ? { globalConfig: stringValue(parsed['--global-config'], '--global-config') }
      : {}),
    help: booleanValue(parsed['--help']),
    imageGenerations: booleanValue(parsed['--image-generations']),
    maxUploadMb,
    model,
    noColor: booleanValue(parsed['--no-color']) || process.env.NO_COLOR !== undefined,
    nonInteractive,
    open: shouldOpen,
    privacy,
    ...(parsed['--project']
      ? { project: stringValue(parsed['--project'], '--project') }
      : {}),
    ...(positionals.length ? { prompt: positionals.join(' ') } : {}),
    ...(parsed['--scope'] ? { scope: stringValue(parsed['--scope'], '--scope') } : {}),
    source,
    ...(parsed['--team'] ? { team: stringValue(parsed['--team'], '--team') } : {}),
    ...(parsed['--token'] ? { token: stringValue(parsed['--token'], '--token') } : {}),
    version: booleanValue(parsed['--version']),
    yes: booleanValue(parsed['--yes']),
    ...(parsed['--zip-url']
      ? { zipUrl: stringValue(parsed['--zip-url'], '--zip-url') }
      : {}),
  }
}

function parseRawArguments(argv: string[]) {
  return arg(
    {
      '--api': String,
      '--cwd': String,
      '--debug': Boolean,
      '-d': '--debug',
      '--dry-run': Boolean,
      '--format': String,
      '-F': '--format',
      '--global-config': String,
      '-Q': '--global-config',
      '--help': Boolean,
      '-h': '--help',
      '--image-generations': Boolean,
      '--max-upload-mb': Number,
      '--model': String,
      '--no-color': Boolean,
      '--non-interactive': Boolean,
      '--open': Boolean,
      '--no-open': Boolean,
      '--privacy': String,
      '--project': String,
      '--scope': String,
      '-S': '--scope',
      '--source': String,
      '--team': String,
      '-T': '--team',
      '--token': String,
      '-t': '--token',
      '--version': Boolean,
      '-v': '--version',
      '--yes': Boolean,
      '-y': '--yes',
      '--zip-url': String,
    },
    { argv },
  )
}

function booleanValue(value: unknown): boolean {
  return value === true
}

function numberValue(value: unknown, flag: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CliError(`${flag} requires a number.`, { exitCode: 2 })
  }
  return value
}

function stringValue(value: unknown, flag: string): string {
  if (typeof value !== 'string')
    throw new CliError(`${flag} requires a value.`, { exitCode: 2 })
  return value
}

function invalid(flag: string, value: string, allowed: string): never {
  throw new CliError(`Invalid ${flag} value "${value}". Expected one of: ${allowed}.`, {
    exitCode: 2,
  })
}
