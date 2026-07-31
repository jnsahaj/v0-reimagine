export type OutputFormat = 'human' | 'json'
export type Privacy = 'public' | 'private' | 'team' | 'team-edit' | 'unlisted'
export type ModelId = 'v0-mini' | 'v0-pro' | 'v0-max' | 'v0-max-fast'
export type SourceMode = 'auto' | 'github' | 'local'

export interface CliOptions {
  apiUrl: string
  command: 'reimagine' | 'login' | 'logout' | 'whoami' | 'inspect' | 'doctor' | 'help'
  cwd: string
  debug: boolean
  dryRun: boolean
  format: OutputFormat
  globalConfig?: string
  help: boolean
  imageGenerations: boolean
  maxUploadMb: number
  model: ModelId
  noColor: boolean
  nonInteractive: boolean
  open: boolean
  privacy: Privacy
  project?: string
  prompt?: string
  scope?: string
  source: SourceMode
  team?: string
  token?: string
  version: boolean
  yes: boolean
  zipUrl?: string
}

export interface GitContext {
  ahead: number
  branch?: string
  clean: boolean
  githubUrl?: string
  remoteName?: string
  repositoryRoot: string
  upstream?: string
}

export interface VercelContext {
  orgId?: string
  projectId?: string
  projectName?: string
  rootDirectory?: string
  source: 'flags' | 'env' | 'project-json' | 'repo-json' | 'none'
  team?: string
  verified: boolean
}

export interface ProjectContext {
  cwd: string
  framework: string
  git?: GitContext
  name: string
  packageManager: string
  projectRoot: string
  relativeProjectRoot?: string
  vercel: VercelContext
}

export interface SnapshotFile {
  absolutePath: string
  binary: boolean
  content: Uint8Array
  path: string
  size: number
}

export interface ProjectSnapshot {
  archive: Uint8Array
  excluded: string[]
  files: SnapshotFile[]
  secretWarnings: string[]
  totalBytes: number
}

export interface UsageMetric {
  cacheRead: number
  cacheWrite: number
  input: number
  output: number
  total: number
}

export interface Usage {
  creditsCost: UsageMetric
  tokens: UsageMetric
}

export interface V0Chat {
  authorId: string
  createdAt: string
  id: string
  metadata: Record<string, string>
  privacy: Privacy
  title?: string
  updatedAt?: string
  url?: string
  vercelProjectId?: string
  webUrl?: string
  writePermission: boolean
}

export interface V0MessagePart {
  [key: string]: unknown
  type: string
}

export interface V0Message {
  [key: string]: unknown
  chatId: string
  content: string
  finishReason: string | null
  id: string
  parts: V0MessagePart[]
  role: 'user' | 'assistant'
  usage?: Usage | undefined
}

export interface ReimagineResult {
  chat: V0Chat
  chatUrl: string
  message?: V0Message
  project: ProjectContext
  source: 'github' | 'zip' | 'files'
  usage?: Usage
}
