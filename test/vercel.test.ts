import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectVercel } from '../src/project/vercel.js'

describe('inspectVercel', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('discovers a standard .vercel/project.json link', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '')
    vi.stubEnv('VERCEL_TOKEN', '')
    const root = await mkdtemp(join(tmpdir(), 'v0-reimagine-vercel-'))
    await mkdir(join(root, '.vercel'))
    await writeFile(
      join(root, '.vercel/project.json'),
      JSON.stringify({ orgId: 'team_123', projectId: 'prj_123', projectName: 'site' }),
    )

    await expect(inspectVercel({ cwd: root })).resolves.toMatchObject({
      orgId: 'team_123',
      projectId: 'prj_123',
      projectName: 'site',
      source: 'project-json',
    })
  })

  it('selects the most specific monorepo project from repo.json', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '')
    vi.stubEnv('VERCEL_TOKEN', '')
    const root = await mkdtemp(join(tmpdir(), 'v0-reimagine-repo-'))
    const app = join(root, 'apps/web/admin')
    await mkdir(join(root, '.vercel'), { recursive: true })
    await mkdir(app, { recursive: true })
    await writeFile(
      join(root, '.vercel/repo.json'),
      JSON.stringify({
        orgId: 'team_123',
        projects: [
          { directory: 'apps/web', id: 'prj_web', name: 'web' },
          { directory: 'apps/web/admin', id: 'prj_admin', name: 'admin' },
        ],
      }),
    )

    await expect(inspectVercel({ cwd: app })).resolves.toMatchObject({
      projectId: 'prj_admin',
      projectName: 'admin',
      rootDirectory: 'apps/web/admin',
      source: 'repo-json',
    })
  })

  it('gives explicit flags precedence over local links', async () => {
    vi.stubEnv('VERCEL_PROJECT_ID', '')
    vi.stubEnv('VERCEL_TOKEN', '')
    const root = await mkdtemp(join(tmpdir(), 'v0-reimagine-flags-'))

    await expect(
      inspectVercel({ cwd: root, project: 'prj_override', team: 'team_override' }),
    ).resolves.toMatchObject({
      orgId: 'team_override',
      projectId: 'prj_override',
      source: 'flags',
      team: 'team_override',
    })
  })
})
