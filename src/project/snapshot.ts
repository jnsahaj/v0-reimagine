import { lstat, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import fg from 'fast-glob'
import { zipSync } from 'fflate'
import ignore from 'ignore'
import { CliError } from '../errors.js'
import type { ProjectSnapshot, SnapshotFile } from '../types.js'

const ALWAYS_EXCLUDE_DIRECTORIES = [
  '.git',
  '.vercel',
  '.worktrees',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  '.turbo',
  'coverage',
  '.cache',
  'out',
  'target',
]
const ALWAYS_EXCLUDE = ALWAYS_EXCLUDE_DIRECTORIES.flatMap((directory) => [
  directory,
  `${directory}/**`,
  `**/${directory}`,
  `**/${directory}/**`,
])

export const V0_FILE_LIMIT = 1000
export const V0_MAX_FILE_BYTES = 3_000_000

const SECRET_FILE_PATTERNS = [
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.netrc$/,
  /(^|\/)id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/,
  /\.(?:pem|key|p12|pfx|jks)$/i,
]

const ALLOWED_ENV_EXAMPLES = /\.env\.(?:example|sample|template)$/i
const EMBEDDED_SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, 'GitHub token'],
  [/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/, 'Slack token'],
]

export async function createSnapshot(projectRoot: string): Promise<ProjectSnapshot> {
  const matcher = ignore().add(ALWAYS_EXCLUDE)
  for (const ignoreFile of ['.gitignore', '.v0reimagineignore']) {
    try {
      matcher.add(await readFile(resolve(projectRoot, ignoreFile), 'utf8'))
    } catch {
      // Ignore absent files.
    }
  }

  const paths = await fg('**/*', {
    cwd: projectRoot,
    dot: true,
    ignore: ALWAYS_EXCLUDE,
    onlyFiles: true,
    followSymbolicLinks: false,
    unique: true,
  })
  const files: SnapshotFile[] = []
  const excluded: string[] = []
  const secretWarnings: string[] = []

  for (const path of paths.sort()) {
    const normalized = path.replaceAll('\\', '/')
    if (matcher.ignores(normalized)) {
      excluded.push(normalized)
      continue
    }
    if (isSecretFile(normalized)) {
      excluded.push(`${normalized} (credential file)`)
      continue
    }
    const absolutePath = resolve(projectRoot, normalized)
    const details = await lstat(absolutePath)
    if (details.isSymbolicLink() || !details.isFile()) {
      excluded.push(`${normalized} (not a regular file)`)
      continue
    }
    if (details.size > 10 * 1024 * 1024) {
      excluded.push(`${normalized} (larger than 10 MB)`)
      continue
    }
    const content = await readFile(absolutePath)
    const binary = content.subarray(0, 8192).includes(0)
    if (!binary && details.size <= 1024 * 1024) {
      const text = content.toString('utf8')
      for (const [pattern, label] of EMBEDDED_SECRET_PATTERNS) {
        if (pattern.test(text)) secretWarnings.push(`${normalized}: possible ${label}`)
      }
    }
    files.push({
      absolutePath,
      binary,
      content,
      path: normalized,
      size: details.size,
    })
  }

  if (files.length === 0) {
    throw new CliError('No project files remain after applying upload exclusions.')
  }

  const archiveEntries: Record<string, Uint8Array> = {}
  for (const file of files) archiveEntries[file.path] = file.content
  const archive = zipSync(archiveEntries, { level: 6 })
  return {
    archive,
    excluded,
    files,
    secretWarnings: [...new Set(secretWarnings)],
    totalBytes: files.reduce((total, file) => total + file.size, 0),
  }
}

export function snapshotAsDataUrl(snapshot: ProjectSnapshot): string {
  return `data:application/zip;base64,${Buffer.from(snapshot.archive).toString('base64')}`
}

export function snapshotAsInlineFiles(
  snapshot: ProjectSnapshot,
): Array<{ content: string; name: string }> {
  const binaryFiles = snapshot.files.filter((file) => file.binary)
  if (binaryFiles.length > 0) {
    throw new CliError(
      `The local snapshot contains ${binaryFiles.length} binary file(s), which v0's inline-files endpoint cannot represent.`,
      {
        hint: hostedZipHint(binaryFiles.map((file) => file.path)),
      },
    )
  }
  if (snapshot.files.length === 0) {
    throw new CliError(
      'The local snapshot contains no UTF-8 source files suitable for upload.',
    )
  }
  return snapshot.files.map((file) => ({
    content: Buffer.from(file.content).toString('utf8'),
    name: file.path,
  }))
}

export function validateSnapshotLimits(snapshot: ProjectSnapshot): void {
  if (snapshot.files.length > V0_FILE_LIMIT) {
    throw new CliError(
      `The local snapshot contains ${snapshot.files.length} files, but v0 supports at most ${V0_FILE_LIMIT} files per chat.`,
      {
        hint: 'Exclude generated files or unrelated directories with .v0reimagineignore, then retry `v0-reimagine inspect`.',
      },
    )
  }

  const oversized = snapshot.files.filter((file) => file.size > V0_MAX_FILE_BYTES)
  if (oversized.length > 0) {
    throw new CliError(
      `The local snapshot contains ${oversized.length} file(s) larger than v0's 3 MB per-file limit.`,
      { hint: hostedZipHint(oversized.map((file) => file.path)) },
    )
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function projectRelativePath(root: string, file: string): string {
  return relative(root, file).replaceAll('\\', '/')
}

function isSecretFile(path: string): boolean {
  if (ALLOWED_ENV_EXAMPLES.test(path)) return false
  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(path))
}

function hostedZipHint(paths: string[]): string {
  const preview = paths.slice(0, 5).join(', ')
  const remainder = paths.length > 5 ? ` and ${paths.length - 5} more` : ''
  return `Affected: ${preview}${remainder}. Exclude them with .v0reimagineignore or provide a compatible hosted archive with --zip-url.`
}
