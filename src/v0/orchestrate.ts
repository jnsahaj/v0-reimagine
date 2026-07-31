import { CliError } from '../errors.js'
import {
  createSnapshot,
  formatBytes,
  snapshotAsDataUrl,
  snapshotAsInlineFiles,
  validateSnapshotLimits,
} from '../project/snapshot.js'
import { chooseSource } from '../project/source.js'
import type {
  CliOptions,
  ProjectContext,
  ProjectSnapshot,
  ReimagineResult,
  V0Chat,
} from '../types.js'
import type { Output } from '../ui/output.js'
import { V0Client } from './client.js'
import { resolveInteractions } from './interactions.js'
import { buildSystemPrompt, buildUserPrompt } from './prompt.js'

export interface PreparedRun {
  project: ProjectContext
  selected: ReturnType<typeof chooseSource>
  snapshot?: ProjectSnapshot
  upload?:
    | { type: 'files'; files: Array<{ content: string; name: string }> }
    | { type: 'zip'; url?: string }
}

export async function prepareRun(
  project: ProjectContext,
  options: CliOptions,
): Promise<PreparedRun> {
  const selected = chooseSource(project, options.source)
  const snapshot =
    selected.type === 'local' && !options.zipUrl
      ? await createSnapshot(project.projectRoot)
      : undefined
  let upload: PreparedRun['upload']
  if (selected.type === 'local') {
    if (options.zipUrl) {
      upload = { type: 'zip', url: options.zipUrl }
    } else if (snapshot) {
      validateSnapshotLimits(snapshot)
      upload =
        snapshot.archive.byteLength <= options.maxUploadMb * 1024 * 1024
          ? { type: 'zip' }
          : { type: 'files', files: snapshotAsInlineFiles(snapshot) }
    }
  }
  return {
    project,
    selected,
    ...(snapshot ? { snapshot } : {}),
    ...(upload ? { upload } : {}),
  }
}

export async function runReimagination(input: {
  apiKey: string
  cli: CliOptions
  onChatCreated?: (chatUrl: string) => Promise<void> | void
  output: Output
  prepared: PreparedRun
  version: string
}): Promise<ReimagineResult> {
  const { cli, output, prepared, version } = input
  const client = new V0Client({
    apiKey: input.apiKey,
    baseUrl: cli.apiUrl,
    debug: (message) => output.debug(message),
    version,
  })
  const project = prepared.project
  const metadata = buildMetadata(project, prepared.selected.type, version)
  const importOptions = {
    metadata,
    privacy: cli.privacy,
    title: `${project.name} — reimagined`,
  }

  output.spinner('Creating a private v0 workspace…')
  let imported: Awaited<ReturnType<V0Client['createFromRepo']>>
  let source: ReimagineResult['source']
  if (prepared.selected.type === 'github' && project.git?.githubUrl) {
    imported = await client.createFromRepo(
      {
        url: project.git.githubUrl,
        ...(project.git.branch ? { branch: project.git.branch } : {}),
      },
      importOptions,
    )
    source = 'github'
  } else if (prepared.upload?.type === 'zip') {
    const zipUrl =
      prepared.upload.url ?? snapshotAsDataUrl(prepared.snapshot as ProjectSnapshot)
    imported = await client.createFromZip(zipUrl, importOptions)
    source = 'zip'
  } else if (prepared.upload?.type === 'files') {
    imported = await client.createFromFiles(prepared.upload.files, importOptions)
    source = 'files'
  } else {
    throw new Error('No valid project upload was prepared.')
  }

  const chatUrl = resolveChatUrl(imported.chat)
  output.stopSpinner()
  await input.onChatCreated?.(chatUrl)
  output.info(`Chat: ${imported.chat.id} (${chatUrl})`)
  if (
    imported.chat.vercelProjectId &&
    project.vercel.projectId &&
    imported.chat.vercelProjectId !== project.vercel.projectId
  ) {
    output.info(
      `Vercel: v0 connected the imported repository to project ${imported.chat.vercelProjectId}; your local link remains ${project.vercel.projectId} and was not modified.`,
    )
  } else if (project.vercel.projectId && !imported.chat.vercelProjectId) {
    output.info(
      `Vercel: local project ${project.vercel.projectId} was provided as context; v0 did not report a chat association.`,
    )
  }

  output.spinner('Reimagining the website…')
  const streamed = await client.sendMessageStream(
    imported.chat.id,
    {
      imageGenerations: cli.imageGenerations,
      message: buildUserPrompt(cli.prompt),
      model: cli.model,
      systemPrompt: buildSystemPrompt(project),
    },
    (event) => output.spinnerText(streamStatus(event)),
  )
  let finalUsage = streamed.usage
  const initialMessage =
    streamed.finalMessage ??
    (await client.getLatestAssistantMessage(imported.chat.id).catch(() => undefined))
  let message = await resolveInteractions({
    chatUrl,
    client,
    cli,
    ...(initialMessage ? { message: initialMessage } : {}),
    output,
  })
  if (!hasImplementationEdits(message)) {
    output.spinner('Ensuring v0 implements the reimagination…')
    const implementation = await client.sendMessageStream(
      imported.chat.id,
      {
        imageGenerations: cli.imageGenerations,
        message:
          'Implement the reimagination now. Do not return another plan or an explanation-only response. Make substantive edits to the application UI, preserve its functionality, run the relevant checks, and finish with a concise summary.',
        model: cli.model,
        systemPrompt: buildSystemPrompt(project),
      },
      (event) => output.spinnerText(streamStatus(event)),
    )
    finalUsage = implementation.usage ?? finalUsage
    const implementationMessage =
      implementation.finalMessage ??
      (await client.getLatestAssistantMessage(imported.chat.id).catch(() => undefined))
    message = await resolveInteractions({
      chatUrl,
      client,
      cli,
      ...(implementationMessage ? { message: implementationMessage } : {}),
      output,
    })
  }
  if (!hasImplementationEdits(message)) {
    throw new CliError('v0 stopped without implementing the reimagination.', {
      hint: `Continue in ${chatUrl}`,
    })
  }
  const chat = await client.getChat(imported.chat.id).catch(() => imported.chat)
  output.success('Reimagination ready')
  return {
    chat,
    chatUrl: resolveChatUrl(chat),
    ...(message ? { message } : {}),
    project,
    source,
    usage: finalUsage ?? message?.usage ?? imported.usage,
  }
}

function hasImplementationEdits(message?: ReimagineResult['message']): boolean {
  return Boolean(
    message?.parts.some(
      (part) =>
        part.type === 'file-edit' &&
        typeof part.path === 'string' &&
        !isPlanArtifact(part.path),
    ),
  )
}

function isPlanArtifact(path: string): boolean {
  return /^(?:\.v0(?:[-_/]|$)|v0[-_]plans?(?:\/|$))/i.test(path)
}

export function dryRunSummary(prepared: PreparedRun): Record<string, unknown> {
  const { project, selected, snapshot } = prepared
  return {
    project: {
      name: project.name,
      root: project.projectRoot,
      framework: project.framework,
      packageManager: project.packageManager,
    },
    git: project.git
      ? {
          repository: project.git.githubUrl,
          branch: project.git.branch,
          clean: project.git.clean,
          ahead: project.git.ahead,
        }
      : null,
    vercel: project.vercel,
    source: selected.type,
    sourceReason: selected.reason,
    upload: snapshot
      ? {
          fileCount: snapshot.files.length,
          inputBytes: snapshot.totalBytes,
          inputSize: formatBytes(snapshot.totalBytes),
          archiveBytes: snapshot.archive.byteLength,
          archiveSize: formatBytes(snapshot.archive.byteLength),
          endpoint: prepared.upload?.type === 'zip' ? 'from-zip' : 'from-files',
          excludedCount: snapshot.excluded.length,
          excluded: snapshot.excluded.slice(0, 200),
          excludedTruncated: snapshot.excluded.length > 200,
          secretWarnings: snapshot.secretWarnings,
          files: snapshot.files.slice(0, 200).map((file) => file.path),
          filesTruncated: snapshot.files.length > 200,
        }
      : null,
  }
}

function buildMetadata(
  project: ProjectContext,
  source: 'github' | 'local',
  version: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      tool: 'v0-reimagine',
      toolVersion: version,
      source,
      framework: project.framework,
      projectName: project.name,
      projectRoot: project.relativeProjectRoot,
      gitRepository: project.git?.githubUrl,
      gitBranch: project.git?.branch,
      vercelProjectId: project.vercel.projectId,
      vercelOrgId: project.vercel.orgId,
    }).flatMap(([key, value]) => (value ? [[key, String(value).slice(0, 500)]] : [])),
  )
}

function resolveChatUrl(chat: V0Chat): string {
  return chat.webUrl ?? chat.url ?? `https://v0.app/chat/${encodeURIComponent(chat.id)}`
}

function streamStatus(event: Record<string, unknown>): string {
  const serialized = JSON.stringify(event)
  if (serialized.includes('file-read')) return 'Inspecting the existing interface…'
  if (serialized.includes('file-edit')) return 'Reworking the interface…'
  if (serialized.includes('"bash"')) return 'Verifying the project…'
  if (serialized.includes('tool-call')) return 'Using project tools…'
  if (serialized.includes('thinking')) return 'Developing the design direction…'
  if (event.object === 'message.usage') return 'Finalizing the reimagination…'
  return 'Reimagining the website…'
}
