import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { VercelContext } from '../types.js'

const projectLinkSchema = z
  .object({
    orgId: z.string().optional(),
    projectId: z.string(),
    projectName: z.string().optional(),
  })
  .passthrough()

const repoLinkSchema = z
  .object({
    orgId: z.string().optional(),
    projects: z.array(
      z
        .object({
          directory: z.string(),
          id: z.string(),
          name: z.string().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()

export async function inspectVercel(options: {
  cwd: string
  debug?: (message: string) => void
  project?: string
  scope?: string
  team?: string
}): Promise<VercelContext> {
  const team = options.team ?? options.scope
  let context: VercelContext

  if (options.project) {
    context = {
      projectId: options.project,
      source: 'flags',
      ...(team ? { orgId: team, team } : {}),
      verified: false,
    }
  } else if (process.env.VERCEL_PROJECT_ID) {
    context = {
      projectId: process.env.VERCEL_PROJECT_ID,
      source: 'env',
      ...(process.env.VERCEL_ORG_ID ? { orgId: process.env.VERCEL_ORG_ID } : {}),
      ...(team ? { team } : {}),
      verified: false,
    }
  } else {
    context = (await readLocalLink(options.cwd)) ?? { source: 'none', verified: false }
    if (team) context = { ...context, orgId: team, team }
  }

  if (!context.projectId || !process.env.VERCEL_TOKEN) return context
  try {
    const verified = await verifyProject(context.projectId, context.orgId)
    return {
      ...context,
      ...(verified.id ? { projectId: verified.id } : {}),
      ...(verified.name ? { projectName: verified.name } : {}),
      ...(verified.rootDirectory ? { rootDirectory: verified.rootDirectory } : {}),
      verified: true,
    }
  } catch (error) {
    options.debug?.(
      `Vercel project verification skipped: ${error instanceof Error ? error.message : String(error)}`,
    )
    return context
  }
}

async function readLocalLink(cwd: string): Promise<VercelContext | undefined> {
  let current = resolve(cwd)
  while (true) {
    const projectFile = resolve(current, '.vercel/project.json')
    const project = await readJson(projectFile, projectLinkSchema)
    if (project) {
      return {
        ...(project.orgId ? { orgId: project.orgId } : {}),
        projectId: project.projectId,
        ...(project.projectName ? { projectName: project.projectName } : {}),
        source: 'project-json',
        verified: false,
      }
    }

    const repoFile = resolve(current, '.vercel/repo.json')
    const repo = await readJson(repoFile, repoLinkSchema)
    if (repo) {
      const fromRepoRoot = relative(current, cwd).replaceAll('\\', '/') || '.'
      const candidates = repo.projects
        .filter((project) => {
          const directory =
            project.directory.replace(/^\.\//, '').replace(/\/$/, '') || '.'
          return fromRepoRoot === directory || fromRepoRoot.startsWith(`${directory}/`)
        })
        .sort((a, b) => b.directory.length - a.directory.length)
      const selected = candidates[0]
      if (selected) {
        return {
          ...(repo.orgId ? { orgId: repo.orgId } : {}),
          projectId: selected.id,
          ...(selected.name ? { projectName: selected.name } : {}),
          rootDirectory: selected.directory,
          source: 'repo-json',
          verified: false,
        }
      }
    }

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return undefined
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | undefined> {
  try {
    const parsed = schema.safeParse(JSON.parse(await readFile(path, 'utf8')))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

async function verifyProject(
  project: string,
  orgId?: string,
): Promise<{ id?: string; name?: string; rootDirectory?: string }> {
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(project)}`)
  if (orgId) {
    if (orgId.startsWith('team_') || orgId.startsWith('org_'))
      url.searchParams.set('teamId', orgId)
    else url.searchParams.set('slug', orgId)
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
  })
  if (!response.ok) throw new Error(`Vercel returned ${response.status}`)
  const payload = (await response.json()) as {
    id?: string
    name?: string
    rootDirectory?: string
  }
  return payload
}

export function vercelLabel(context: VercelContext): string {
  if (!context.projectId) return 'not linked'
  const project = context.projectName ?? context.projectId
  const team = context.team ?? context.orgId
  return team ? `${team}/${project}` : project
}

export function projectNameFromPath(path: string): string {
  return basename(path)
}
