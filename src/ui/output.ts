import process from 'node:process'
import { Chalk, type ChalkInstance, supportsColorStderr } from 'chalk'
import ora, { type Ora } from 'ora'
import type { OutputFormat } from '../types.js'

interface OutputOptions {
  debug: boolean
  format: OutputFormat
  noColor: boolean
}

export interface OutputRow {
  detail?: string
  label: string
  value: string
}

export class Output {
  readonly #debugEnabled: boolean
  readonly #human: boolean
  readonly #style: ChalkInstance
  #spinner: Ora | undefined

  constructor(options: OutputOptions) {
    this.#debugEnabled = options.debug
    this.#human = options.format === 'human'
    this.#style = new Chalk({
      level: options.noColor
        ? 0
        : supportsColorStderr
          ? supportsColorStderr.level
          : process.stderr.isTTY
            ? 1
            : 0,
    })
  }

  banner(version: string): void {
    if (!this.#human) return
    this.write(
      `${this.#style.cyan('◆')} ${this.#style.bold('v0 reimagine')} ${this.#style.dim(version)}`,
    )
    this.write('')
  }

  debug(message: string): void {
    if (this.#debugEnabled) this.write(this.#style.dim(`[debug] ${message}`))
  }

  error(message: string): void {
    this.stopSpinner()
    this.write(`${this.#style.red('✖')} ${this.#style.bold.red('Error')} ${message}`)
  }

  hint(message: string): void {
    this.write(this.#style.dim(message))
  }

  info(message: string): void {
    if (this.#human) this.write(`${this.#style.cyan('›')} ${message}`)
  }

  json(value: unknown): void {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  }

  link(label: string, url: string): string {
    if (!process.stderr.isTTY || this.#style.level === 0) return `${label}: ${url}`
    return `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`
  }

  table(rows: OutputRow[]): void {
    if (!this.#human || rows.length === 0) return
    const width = Math.max(...rows.map((row) => row.label.length))
    for (const row of rows) {
      const label = this.#style.cyan(row.label.padEnd(width))
      this.write(`  ${label}  ${this.#style.white(row.value)}`)
      if (row.detail) {
        this.write(`  ${' '.repeat(width)}  ${this.#style.dim(row.detail)}`)
      }
    }
    this.write('')
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
    this.write(`${this.#style.green('✓')} ${this.#style.bold(message)}`)
  }

  warn(message: string): void {
    if (this.#human) this.write(`${this.#style.yellow('!')} ${message}`)
  }

  private write(message: string): void {
    process.stderr.write(`${message}\n`)
  }
}
