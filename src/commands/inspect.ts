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
  const summary = dryRunSummary(prepared)
  if (options.format === 'json') {
    output.json(summary)
    return
  }
  printProjectSummary(project, prepared.selected, output)
  if (prepared.snapshot) {
    output.table([
      {
        label: 'Upload',
        value: `${prepared.snapshot.files.length} files · ${formatBytes(prepared.snapshot.archive.byteLength)} compressed`,
      },
      {
        label: 'Endpoint',
        value:
          prepared.snapshot.archive.byteLength <= options.maxUploadMb * 1024 * 1024
            ? 'ZIP data URL'
            : 'Inline files',
      },
      ...(prepared.snapshot.excluded.length > 0
        ? [{ label: 'Excluded', value: `${prepared.snapshot.excluded.length} paths` }]
        : []),
    ])
    for (const warning of prepared.snapshot.secretWarnings) output.warn(warning)
  }
}

export function printProjectSummary(
  project: Awaited<ReturnType<typeof inspectProject>>,
  selected: { reason?: string; type: 'github' | 'local' },
  output: Output,
): void {
  const repository = project.git?.githubUrl
    ? `${project.git.githubUrl.replace(/^https:\/\/github\.com\//, '')}${project.git.branch ? ` · ${project.git.branch}` : ''}`
    : 'Not available'
  output.table([
    { label: 'Project', value: project.name },
    { label: 'Directory', value: project.projectRoot },
    { label: 'Framework', value: project.framework },
    { label: 'Package manager', value: project.packageManager },
    { label: 'GitHub', value: repository },
    { label: 'Vercel', value: vercelLabel(project.vercel) },
    {
      label: 'Source',
      value: selected.type === 'github' ? 'GitHub' : 'Local working tree',
      ...(selected.reason ? { detail: sentenceCase(selected.reason) } : {}),
    },
  ])
}

function sentenceCase(value: string): string {
  const sentence = `${value.charAt(0).toUpperCase()}${value.slice(1)}`
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}
