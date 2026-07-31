export class CliError extends Error {
  readonly code: string | undefined
  readonly exitCode: number
  readonly hint: string | undefined
  readonly statusCode: number | undefined

  constructor(
    message: string,
    options?: { code?: string; exitCode?: number; hint?: string; statusCode?: number },
  ) {
    super(message)
    this.name = 'CliError'
    this.code = options?.code
    this.exitCode = options?.exitCode ?? 1
    this.hint = options?.hint
    this.statusCode = options?.statusCode
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
