import confirm from '@inquirer/confirm'
import open from 'open'
import { requireApiKey } from '../auth/login.js'
import { CliError } from '../errors.js'
import { inspectProject } from '../project/inspect.js'
import { formatBytes } from '../project/snapshot.js'
import type { CliOptions } from '../types.js'
import type { Output } from '../ui/output.js'
import { dryRunSummary, prepareRun, runReimagination } from '../v0/orchestrate.js'
import { printProjectSummary } from './inspect.js'

export async function reimagineCommand(
  options: CliOptions,
  output: Output,
  version: string,
): Promise<void> {
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

  if (options.dryRun) {
    if (options.format === 'json') output.json(dryRunSummary(prepared))
    else {
      printProjectSummary(project, prepared.selected, output)
      if (prepared.snapshot) {
        output.info(
          `Would upload ${prepared.snapshot.files.length} files (${formatBytes(prepared.snapshot.archive.byteLength)} compressed).`,
        )
        for (const warning of prepared.snapshot.secretWarnings) output.warn(warning)
      }
    }
    return
  }

  if (prepared.snapshot?.secretWarnings.length) {
    throw new CliError('Potential secrets were detected in source files.', {
      hint: `${prepared.snapshot.secretWarnings.join('\n')}\nRemove them or exclude the files with .v0reimagineignore.`,
    })
  }

  printProjectSummary(project, prepared.selected, output)
  if (prepared.snapshot) {
    output.info(
      `Upload: ${prepared.snapshot.files.length} files, ${formatBytes(prepared.snapshot.archive.byteLength)} compressed`,
    )
  }

  if (
    options.privacy === 'public' &&
    !options.yes &&
    !options.nonInteractive &&
    !(await confirm({ message: 'Create a public v0 chat?', default: false }))
  ) {
    throw new CliError('Cancelled before creating a public chat.')
  }

  const apiKey = await requireApiKey(options, output, version)
  const result = await runReimagination({
    apiKey,
    cli: options,
    output,
    prepared,
    version,
  })
  if (options.format === 'json') {
    output.json({
      chat: {
        id: result.chat.id,
        title: result.chat.title,
        url: result.chatUrl,
        privacy: result.chat.privacy,
        vercelProjectId: result.chat.vercelProjectId,
      },
      source: result.source,
      project: {
        name: result.project.name,
        root: result.project.projectRoot,
        framework: result.project.framework,
      },
      vercel: result.project.vercel,
      usage: result.usage,
      message: result.message?.content,
    })
  } else {
    output.result(result.chatUrl)
  }
  if (options.open) {
    await open(result.chatUrl).catch((error) => {
      output.warn(
        `Could not open the browser: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }
}
