export class CliError extends Error {
  readonly exitCode: number
  readonly hint: string | undefined

  constructor(message: string, options?: { exitCode?: number; hint?: string }) {
    super(message)
    this.name = 'CliError'
    this.exitCode = options?.exitCode ?? 1
    this.hint = options?.hint
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
