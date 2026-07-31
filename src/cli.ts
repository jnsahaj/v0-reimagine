import process from 'node:process'
import { parseArguments } from './cli/arguments.js'
import { loginCommand, logoutCommand, whoamiCommand } from './commands/auth.js'
import { doctorCommand } from './commands/doctor.js'
import { inspectCommand } from './commands/inspect.js'
import { reimagineCommand } from './commands/reimagine.js'
import { CliError, errorMessage } from './errors.js'
import { commandHelp, rootHelp } from './ui/help.js'
import { Output } from './ui/output.js'

declare const __CLI_VERSION__: string
const version = typeof __CLI_VERSION__ === 'string' ? __CLI_VERSION__ : '0.1.0'

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0)
  throw error
})

async function main(): Promise<number> {
  let options: ReturnType<typeof parseArguments>
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`Error: ${errorMessage(error)}\n`)
    return error instanceof CliError ? error.exitCode : 1
  }

  const output = new Output({
    debug: options.debug,
    format: options.format,
    noColor: options.noColor,
  })
  output.banner(version)

  if (options.version) {
    process.stdout.write(`${version}\n`)
    return 0
  }
  if (options.help || options.command === 'help') {
    process.stdout.write(
      `${options.command === 'help' ? rootHelp() : commandHelp(options.command)}\n`,
    )
    return 0
  }

  try {
    switch (options.command) {
      case 'reimagine':
        await reimagineCommand(options, output, version)
        break
      case 'login':
        await loginCommand(options, output, version)
        break
      case 'logout':
        await logoutCommand(options, output)
        break
      case 'whoami':
        await whoamiCommand(options, output, version)
        break
      case 'inspect':
        await inspectCommand(options, output)
        break
      case 'doctor':
        await doctorCommand(options, output, version)
        break
      default:
        process.stdout.write(`${rootHelp()}\n`)
    }
    return 0
  } catch (error) {
    output.error(errorMessage(error))
    if (error instanceof CliError && error.hint) output.hint(error.hint)
    else if (options.debug && error instanceof Error && error.stack)
      output.hint(error.stack)
    return error instanceof CliError ? error.exitCode : 1
  }
}

process.exitCode = await main()
