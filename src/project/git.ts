import { relative } from 'node:path'
import { execa } from 'execa'
import type { GitContext } from '../types.js'

export async function inspectGit(projectRoot: string): Promise<GitContext | undefined> {
  const repositoryRoot = await git(['rev-parse', '--show-toplevel'], projectRoot)
  if (!repositoryRoot) return undefined

  const pathspec = relative(repositoryRoot, projectRoot) || '.'
  const branch = await git(['branch', '--show-current'], repositoryRoot)
  const upstream = await git(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    repositoryRoot,
  )
  const remoteName = upstream?.split('/')[0] ?? 'origin'
  const remoteUrl = await git(['remote', 'get-url', remoteName], repositoryRoot)
  const githubUrl = remoteUrl ? normalizeGitHubUrl(remoteUrl) : undefined
  const status = await git(
    ['status', '--porcelain=v1', '--untracked-files=all', '--', pathspec],
    repositoryRoot,
  )
  const aheadText = upstream
    ? await git(['rev-list', '--count', `${upstream}..HEAD`], repositoryRoot)
    : undefined
  const remoteBranch = upstream?.includes('/')
    ? upstream.slice(upstream.indexOf('/') + 1)
    : branch

  return {
    ahead: Number.parseInt(aheadText ?? '0', 10) || 0,
    ...(remoteBranch ? { branch: remoteBranch } : {}),
    clean: status === '',
    ...(githubUrl ? { githubUrl } : {}),
    ...(remoteName ? { remoteName } : {}),
    repositoryRoot,
    ...(upstream ? { upstream } : {}),
  }
}

export function githubUnavailableReason(
  gitContext: GitContext | undefined,
): string | undefined {
  if (!gitContext) return 'the directory is not inside a Git repository'
  if (!gitContext.githubUrl) return 'the active Git remote is not hosted on GitHub'
  return undefined
}

export function githubImportNote(gitContext: GitContext): string | undefined {
  if (!gitContext.clean)
    return 'uncommitted and untracked local changes will not be included'
  if (gitContext.ahead > 0)
    return `${gitContext.ahead} unpushed commit(s) will not be included`
  if (!gitContext.upstream)
    return 'the selected branch is not verified against a GitHub upstream'
  return undefined
}

async function git(args: string[], cwd: string): Promise<string | undefined> {
  try {
    const result = await execa('git', args, { cwd, reject: false })
    return result.exitCode === 0 ? result.stdout.trim() : undefined
  } catch {
    return undefined
  }
}

function normalizeGitHubUrl(value: string): string | undefined {
  const ssh = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (ssh?.[1] && ssh[2]) return `https://github.com/${ssh[1]}/${stripGit(ssh[2])}`
  const sshUrl = value.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshUrl?.[1] && sshUrl[2]) {
    return `https://github.com/${sshUrl[1]}/${stripGit(sshUrl[2])}`
  }
  try {
    const url = new URL(value)
    if (url.hostname !== 'github.com') return undefined
    const [owner, repo] = url.pathname.replace(/^\//, '').split('/')
    return owner && repo ? `https://github.com/${owner}/${stripGit(repo)}` : undefined
  } catch {
    return undefined
  }
}

function stripGit(value: string): string {
  return value.replace(/\.git$/, '')
}
