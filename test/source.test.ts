import { describe, expect, it } from 'vitest'
import { chooseSource } from '../src/project/source.js'
import type { GitContext, ProjectContext } from '../src/types.js'

const readyGit: GitContext = {
  ahead: 0,
  branch: 'main',
  clean: true,
  githubUrl: 'https://github.com/acme/site',
  repositoryRoot: '/repo',
  upstream: 'origin/main',
}

function project(git?: GitContext): ProjectContext {
  return {
    cwd: '/repo',
    framework: 'Next.js',
    ...(git ? { git } : {}),
    name: 'site',
    packageManager: 'pnpm',
    projectRoot: '/repo',
    vercel: { source: 'none', verified: false },
  }
}

describe('chooseSource', () => {
  it('uses GitHub when the remote exactly represents the working tree', () => {
    expect(chooseSource(project(readyGit), 'auto')).toEqual({ type: 'github' })
  })

  it('uses GitHub for a linked project and explains that local changes are omitted', () => {
    expect(chooseSource(project({ ...readyGit, clean: false }), 'auto')).toEqual({
      type: 'github',
      reason: 'uncommitted and untracked local changes will not be included',
    })
  })

  it('falls back to a local snapshot only when GitHub is unavailable', () => {
    expect(chooseSource(project(), 'auto')).toEqual({
      type: 'local',
      reason: 'the directory is not inside a Git repository',
    })
  })

  it('explains why a forced GitHub import is unsafe', () => {
    expect(() => chooseSource(project(), 'github')).toThrow(
      'Cannot use GitHub because the directory is not inside a Git repository',
    )
  })
})
