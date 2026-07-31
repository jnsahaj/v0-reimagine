import { execa } from 'execa'
import { configDirectory, resolveCredential } from '../auth/credentials.js'
import { inspectProject } from '../project/inspect.js'
import type { CliOptions } from '../types.js'
import type { Output } from '../ui/output.js'
import { V0Client } from '../v0/client.js'

export async function doctorCommand(
  options: CliOptions,
  output: Output,
  version: string,
): Promise<void> {
  const checks: Array<{ detail: string; name: string; ok: boolean }> = []
  checks.push({
    name: 'Node.js',
    ok: Number(process.versions.node.split('.')[0]) >= 20,
    detail: process.versions.node,
  })
  const git = await execa('git', ['--version'], { reject: false })
  checks.push({
    name: 'Git',
    ok: git.exitCode === 0,
    detail: git.stdout || 'not installed',
  })

  try {
    const project = await inspectProject({
      cwd: options.cwd,
      debug: (message) => output.debug(message),
      ...(options.project ? { project: options.project } : {}),
      ...(options.scope ? { scope: options.scope } : {}),
      ...(options.team ? { team: options.team } : {}),
    })
    checks.push({
      name: 'Project',
      ok: true,
      detail: `${project.framework} at ${project.projectRoot}`,
    })
    checks.push({
      name: 'Vercel',
      ok: Boolean(project.vercel.projectId),
      detail: project.vercel.projectId ?? 'not linked (optional)',
    })
  } catch (error) {
    checks.push({
      name: 'Project',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  const credential = await resolveCredential({
    configDir: configDirectory(options.globalConfig),
    ...(options.token ? { token: options.token } : {}),
  })
  if (credential) {
    try {
      await new V0Client({
        apiKey: credential.apiKey,
        baseUrl: options.apiUrl,
        debug: (message) => output.debug(message),
        version,
      }).validateCredentials()
      checks.push({
        name: 'v0 API',
        ok: true,
        detail: `${credential.source} credentials are valid`,
      })
    } catch (error) {
      checks.push({
        name: 'v0 API',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    checks.push({ name: 'v0 API', ok: false, detail: 'credentials not configured' })
  }

  if (options.format === 'json')
    output.json({
      checks,
      ok: checks.every((check) => check.ok || check.name === 'Vercel'),
    })
  else {
    for (const check of checks) {
      if (check.ok) output.success(`${check.name}: ${check.detail}`)
      else if (check.name === 'Vercel') output.warn(`${check.name}: ${check.detail}`)
      else output.warn(`${check.name}: ${check.detail}`)
    }
  }
}
