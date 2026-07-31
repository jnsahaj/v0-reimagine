import { describe, expect, it } from 'vitest'
import type { ProjectContext } from '../src/types.js'
import { buildSystemPrompt, buildUserPrompt } from '../src/v0/prompt.js'

describe('v0 prompts', () => {
  it('includes monorepo and existing Vercel context without secret values', () => {
    const project: ProjectContext = {
      cwd: '/repo/apps/web',
      framework: 'Next.js',
      name: 'web',
      packageManager: 'pnpm',
      projectRoot: '/repo/apps/web',
      relativeProjectRoot: 'apps/web',
      vercel: {
        orgId: 'team_123',
        projectId: 'prj_123',
        source: 'project-json',
        verified: false,
      },
    }

    const prompt = buildSystemPrompt(project)
    expect(prompt).toContain('Focus the reimagination on apps/web')
    expect(prompt).toContain('Vercel project prj_123')
    expect(prompt).toContain('team/scope team_123')
    expect(prompt).toContain('Never expose or invent secret values')
  })

  it('appends optional creative direction', () => {
    expect(buildUserPrompt('  Brutalist but usable.  ')).toContain(
      'Brutalist but usable.',
    )
  })
})
