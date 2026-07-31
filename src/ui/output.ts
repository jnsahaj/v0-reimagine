import process from 'node:process'
import { Chalk, type ChalkInstance } from 'chalk'
import ora, { type Ora } from 'ora'
import type { OutputFormat } from '../types.js'

interface OutputOptions {
  debug: boolean
  format: OutputFormat
  noColor: boolean
}

export class Output {
  readonly #debugEnabled: boolean
  readonly #human: boolean
  readonly #style: ChalkInstance
  #spinner: Ora | undefined

  constructor(options: OutputOptions) {
    this.#debugEnabled = options.debug
    this.#human = options.format === 'human'
    this.#style = new Chalk(options.noColor ? { level: 0 } : {})
  }

  banner(version: string): void {
    if (!this.#human) return
    this.write(
      this.#style.dim(`V0 Reimagine CLI ${version} (Node.js ${process.versions.node})`),
    )
    this.write('')
  }

  debug(message: string): void {
    if (this.#debugEnabled) this.write(this.#style.dim(`[debug] ${message}`))
  }

  error(message: string): void {
    this.stopSpinner()
    this.write(`${this.#style.red('Error:')} ${message}`)
  }

  hint(message: string): void {
    this.write(this.#style.dim(message))
  }

  info(message: string): void {
    if (this.#human) this.write(`${this.#style.gray('>')} ${message}`)
  }

  json(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  }

  link(label: string, url: string): string {
    if (!process.stderr.isTTY || this.#style.level === 0) return `${label}: ${url}`
    return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`
  }

  result(value: string): void {
    process.stdout.write(`${value}\n`)
  }

  spinner(text: string): void {
    if (!this.#human) return
    this.stopSpinner()
    if (process.stderr.isTTY) {
      this.#spinner = ora({ text, stream: process.stderr }).start()
    } else {
      this.info(text)
    }
  }

  spinnerText(text: string): void {
    if (this.#spinner) this.#spinner.text = text
  }

  stopSpinner(text?: string): void {
    if (!this.#spinner) return
    if (text) this.#spinner.succeed(text)
    else this.#spinner.stop()
    this.#spinner = undefined
  }

  success(message: string): void {
    if (!this.#human) return
    if (this.#spinner) {
      this.stopSpinner(message)
      return
    }
    this.write(`${this.#style.green('✓')} ${message}`)
  }

  warn(message: string): void {
    if (this.#human) this.write(`${this.#style.yellow('WARN!')} ${message}`)
  }

  private write(message: string): void {
    process.stderr.write(`${message}\n`)
  }
}
