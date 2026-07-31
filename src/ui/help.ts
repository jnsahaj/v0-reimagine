const globalOptions = `
GLOBAL OPTIONS
  -h, --help                 Output usage information
  -v, --version              Output the version number
      --cwd DIR              Set the working directory for this run
  -d, --debug                Enable debug output
      --no-color             Disable color and emoji output
      --non-interactive      Never prompt for input
  -y, --yes                  Accept safe default choices
  -S, --scope SCOPE          Set the Vercel scope
  -T, --team TEAM            Set the Vercel team slug or ID
      --project NAME_OR_ID   Override the detected Vercel project
  -t, --token TOKEN          v0 API key (prefer V0_API_KEY)
  -F, --format FORMAT        Output format: human or json
  -Q, --global-config DIR    Override the global config directory
`

export function rootHelp(): string {
  return `V0 Reimagine CLI

USAGE
  v0-reimagine [prompt] [options]
  v0-reimagine <command> [options]

COMMANDS
  reimagine [prompt]   Reimagine the web project in the working directory
  login                Save and validate a v0 API key
  logout               Delete the saved v0 API key
  whoami               Validate the active v0 credentials
  inspect              Inspect project, Git, Vercel, and upload source context
  doctor               Check local prerequisites and configuration
  help                 Show this help

REIMAGINE OPTIONS
      --source MODE           auto, github, or local (default: auto)
      --model MODEL           v0-mini, v0-pro, v0-max, or v0-max-fast
      --privacy PRIVACY       private, team, team-edit, unlisted, or public
      --image-generations     Allow v0 to generate images
      --zip-url URL           Use an already-hosted ZIP instead of a local data URL
      --max-upload-mb NUMBER  Maximum data-URL ZIP size (default: 10)
      --dry-run               Inspect exactly what would be sent without uploading
      --open / --no-open      Control browser handoff
${globalOptions}
EXAMPLES
  v0-reimagine
  v0-reimagine "Make it calm, editorial, and unusually premium"
  v0-reimagine --source=local --dry-run
  v0-reimagine inspect --format=json
`
}

export function commandHelp(command: string): string {
  if (command === 'reimagine') return rootHelp()
  return `V0 Reimagine CLI — ${command}

USAGE
  v0-reimagine ${command} [options]
${globalOptions}`
}
