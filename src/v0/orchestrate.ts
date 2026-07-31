import {
  createSnapshot,
  formatBytes,
  snapshotAsDataUrl,
  snapshotAsInlineFiles,
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
  return { project, selected, ...(snapshot ? { snapshot } : {}) }
}

export async function runReimagination(input: {
  apiKey: string
  cli: CliOptions
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
  } else if (cli.zipUrl) {
    imported = await client.createFromZip(cli.zipUrl, importOptions)
    source = 'zip'
  } else if (
    prepared.snapshot &&
    prepared.snapshot.archive.byteLength <= cli.maxUploadMb * 1024 * 1024
  ) {
    imported = await client.createFromZip(
      snapshotAsDataUrl(prepared.snapshot),
      importOptions,
    )
    source = 'zip'
  } else {
    imported = await client.createFromFiles(
      snapshotAsInlineFiles(prepared.snapshot as ProjectSnapshot),
      importOptions,
    )
    source = 'files'
  }

  const chatUrl = resolveChatUrl(imported.chat)
  if (
    imported.chat.vercelProjectId &&
    project.vercel.projectId &&
    imported.chat.vercelProjectId !== project.vercel.projectId
  ) {
    output.warn(
      `v0 associated chat ${imported.chat.id} with Vercel project ${imported.chat.vercelProjectId}, not detected project ${project.vercel.projectId}.`,
    )
  } else if (project.vercel.projectId && !imported.chat.vercelProjectId) {
    output.warn(
      'The existing Vercel project was detected but v0 did not attach it. No duplicate project was created.',
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
  const message = await resolveInteractions({
    chatUrl,
    client,
    cli,
    ...(streamed.finalMessage ? { message: streamed.finalMessage } : {}),
    output,
  })
  const chat = await client.getChat(imported.chat.id).catch(() => imported.chat)
  output.success('Reimagination ready')
  return {
    chat,
    chatUrl: resolveChatUrl(chat),
    ...(message ? { message } : {}),
    project,
    source,
    usage: streamed.usage ?? message?.usage ?? imported.usage,
  }
}

export function dryRunSummary(
  prepared: PreparedRun,
  cli: CliOptions,
): Record<string, unknown> {
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
          endpoint:
            snapshot.archive.byteLength <= cli.maxUploadMb * 1024 * 1024
              ? 'from-zip'
              : 'from-files',
          excluded: snapshot.excluded,
          secretWarnings: snapshot.secretWarnings,
          files: snapshot.files.map((file) => file.path),
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
