import { inspectProject } from '../project/inspect.js'
import { formatBytes } from '../project/snapshot.js'
import { vercelLabel } from '../project/vercel.js'
import type { CliOptions } from '../types.js'
import type { Output } from '../ui/output.js'
import { dryRunSummary, prepareRun } from '../v0/orchestrate.js'

export async function inspectCommand(options: CliOptions, output: Output): Promise<void> {
  output.spinner('Inspecting project…')
  const project = await inspectProject({
    cwd: options.cwd,
    debug: (message) => output.debug(message),
    ...(options.project ? { project: options.project } : {}),
    ...(options.scope ? { scope: options.scope } : {}),
    ...(options.team ? { team: options.team } : {}),
  })
  const prepared = await prepareRun(project, options)
  output.stopSpinner()
  const summary = dryRunSummary(prepared, options)
  if (options.format === 'json') {
    output.json(summary)
    return
  }
  printProjectSummary(project, prepared.selected, output)
  if (prepared.snapshot) {
    output.info(
      `Upload: ${prepared.snapshot.files.length} files, ${formatBytes(prepared.snapshot.archive.byteLength)} compressed`,
    )
    output.info(
      `Endpoint: ${prepared.snapshot.archive.byteLength <= options.maxUploadMb * 1024 * 1024 ? 'ZIP data URL' : 'inline files'}`,
    )
    if (prepared.snapshot.excluded.length > 0) {
      output.info(`Excluded: ${prepared.snapshot.excluded.length} paths`)
    }
    for (const warning of prepared.snapshot.secretWarnings) output.warn(warning)
  }
}

export function printProjectSummary(
  project: Awaited<ReturnType<typeof inspectProject>>,
  selected: { reason?: string; type: 'github' | 'local' },
  output: Output,
): void {
  output.info(`Project: ${project.name}`)
  output.info(`Directory: ${project.projectRoot}`)
  output.info(`Framework: ${project.framework}`)
  output.info(`Package manager: ${project.packageManager}`)
  output.info(
    `GitHub: ${project.git?.githubUrl ? `${project.git.githubUrl}${project.git.branch ? `@${project.git.branch}` : ''}` : 'not available'}`,
  )
  output.info(`Vercel: ${vercelLabel(project.vercel)}`)
  output.info(`Source: ${selected.type}${selected.reason ? ` — ${selected.reason}` : ''}`)
}
