import { access, readFile, stat } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { CliError } from '../errors.js'
import type { ProjectContext } from '../types.js'
import { inspectGit } from './git.js'
import { inspectVercel, projectNameFromPath } from './vercel.js'

export async function inspectProject(options: {
  cwd: string
  debug?: (message: string) => void
  project?: string
  scope?: string
  team?: string
}): Promise<ProjectContext> {
  let cwd: string
  try {
    cwd = resolve(options.cwd)
    if (!(await stat(cwd)).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new CliError(
      `The working directory does not exist or is not a directory: ${options.cwd}`,
    )
  }

  const projectRoot = await findProjectRoot(cwd)
  if (!projectRoot) {
    throw new CliError('No web project was found in the working directory.', {
      hint: 'Run the command from a directory containing package.json, or pass --cwd.',
    })
  }

  const manifest = await readManifest(projectRoot)
  const git = await inspectGit(projectRoot)
  const vercel = await inspectVercel({
    cwd: projectRoot,
    ...(options.debug ? { debug: options.debug } : {}),
    ...(options.project ? { project: options.project } : {}),
    ...(options.scope ? { scope: options.scope } : {}),
    ...(options.team ? { team: options.team } : {}),
  })
  const relativeProjectRoot = git
    ? relative(git.repositoryRoot, projectRoot).replaceAll('\\', '/') || '.'
    : undefined

  return {
    cwd,
    framework: detectFramework(manifest),
    ...(git ? { git } : {}),
    name:
      typeof manifest.name === 'string'
        ? manifest.name
        : (vercel.projectName ?? projectNameFromPath(projectRoot)),
    packageManager: await detectPackageManager(projectRoot),
    projectRoot,
    ...(relativeProjectRoot ? { relativeProjectRoot } : {}),
    vercel,
  }
}

async function findProjectRoot(start: string): Promise<string | undefined> {
  let current = start
  while (true) {
    try {
      await access(resolve(current, 'package.json'))
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return undefined
      current = parent
    }
  }
}

async function readManifest(root: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >
  } catch {
    throw new CliError(`Unable to parse ${resolve(root, 'package.json')}.`)
  }
}

function detectFramework(manifest: Record<string, unknown>): string {
  const dependencies = {
    ...(isRecord(manifest.dependencies) ? manifest.dependencies : {}),
    ...(isRecord(manifest.devDependencies) ? manifest.devDependencies : {}),
  }
  const checks: Array<[string, string]> = [
    ['next', 'Next.js'],
    ['@remix-run/react', 'Remix'],
    ['@sveltejs/kit', 'SvelteKit'],
    ['nuxt', 'Nuxt'],
    ['astro', 'Astro'],
    ['vite', 'Vite'],
    ['react', 'React'],
    ['vue', 'Vue'],
    ['svelte', 'Svelte'],
  ]
  return checks.find(([dependency]) => dependency in dependencies)?.[1] ?? 'Web project'
}

async function detectPackageManager(root: string): Promise<string> {
  for (const [file, name] of [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['package-lock.json', 'npm'],
  ] as const) {
    try {
      await access(resolve(root, file))
      return name
    } catch {
      // Continue.
    }
  }
  return 'npm'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
