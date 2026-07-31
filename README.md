# v0-reimagine

Reimagine an existing website with [v0](https://v0.app) from its project directory.

`v0-reimagine` inspects the current web project, chooses the safest way to give v0
an exact snapshot, carries forward local Vercel project/team context, and gives v0
instructions to redesign the UI without discarding the application that already works.

```console
$ cd my-web-project
$ v0-reimagine "Warm editorial direction with unusually good typography"
V0 Reimagine CLI 0.1.0 (Node.js 22.19.0)

> Project: my-web-project
> GitHub: https://github.com/acme/my-web-project@main
> Vercel: acme/my-web-project
> Source: github
...
https://v0.app/chat/...
```

The CLI is built against the [v0 Platform API v2](https://v0.app/docs/api/v2).
That API is currently beta, so response validation is deliberately strict and the API
base URL can be overridden for testing.

## Install

Node.js 20 or newer is required. Run it directly without installing:

```sh
npx v0-reimagine
npx v0-reimagine "Warm editorial direction with unusually good typography"
```

Or install the command globally:

```sh
npm install --global v0-reimagine
```

To work on the CLI itself, install it from source:

```sh
git clone https://github.com/jnsahaj/v0-reimagine.git
cd v0-reimagine
corepack enable
pnpm install
pnpm build
npm install --global .
```

Then run `v0-reimagine` from any directory containing a web project's `package.json`.

## Quick start

```sh
# Reimagine the current project with v0's default creative direction
v0-reimagine

# Add your own direction
v0-reimagine "Make it playful, tactile, and high-contrast"

# Preview the source and files that would be sent, without authenticating or uploading
v0-reimagine --dry-run

# Machine-readable inspection for scripts and agents
v0-reimagine inspect --format=json
```

On the first authenticated run, the CLI opens
[v0 API key settings](https://v0.app/settings/keys), asks for the key with masked input,
validates it, and stores it in `~/.config/v0-reimagine/auth.json` with owner-only
permissions. `V0_API_KEY` and `--token` are also supported and are never persisted.

## How source selection works

The default `--source=auto` policy is designed to make v0 see the same code that you see:

1. GitHub is used when the project has a GitHub remote, the current branch tracks an
   upstream, it is not ahead of that upstream, and the project has no uncommitted or
   untracked files.
2. Otherwise a local snapshot is created. Small snapshots use v0's ZIP import endpoint;
   larger snapshots fall back to the inline-files endpoint.
3. `--source=github` or `--source=local` can make the choice explicit. A forced GitHub
   import still refuses when the remote cannot represent the current working tree.

Local snapshots honor `.gitignore` and an optional `.v0reimagineignore`. They always
exclude dependency/build directories, `.vercel`, `.env*` credential files, private keys,
and common credential files. `.env.example`, `.env.sample`, and `.env.template` remain
eligible. The CLI scans small text files for common embedded credential patterns and
stops before upload when it finds one.

Use `.v0reimagineignore` for anything else that should never leave the machine:

```gitignore
fixtures/customer-data/**
internal-notes.md
public/large-demo-video.mp4
```

## Vercel project and team detection

The CLI resolves Vercel context in this order:

1. `--project` together with `--team` or `--scope`
2. `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID`
3. the nearest `.vercel/project.json`
4. the most specific matching entry in a monorepo `.vercel/repo.json`

If `VERCEL_TOKEN` is available, detection is verified with a read-only Vercel API call.
The project/team IDs are included in v0 chat metadata and in the system instructions so
the reimagination preserves deployment settings, environment-variable names, managed
integrations, and the monorepo root.

The documented v0 API currently exposes project creation, but not an endpoint for
forcibly attaching an existing Vercel project to a chat. This CLI therefore never creates
a replacement project. It keeps the existing project as context, accepts an association
returned naturally by repository import, and warns if v0 reports a different association.

## Commands

| Command | Purpose |
| --- | --- |
| `v0-reimagine [prompt]` | Reimagine the project in the current directory |
| `v0-reimagine reimagine [prompt]` | Explicit form of the default command |
| `v0-reimagine login` | Open API key settings, validate a key, and save it |
| `v0-reimagine logout` | Delete the saved key |
| `v0-reimagine whoami` | Validate the active credentials |
| `v0-reimagine inspect` | Show detected project, Git, Vercel, source, and upload context |
| `v0-reimagine doctor` | Check Node.js, Git, the project, Vercel link, and v0 credentials |
| `v0-reimagine help` | Show help |

### Reimagination options

| Flag | Description |
| --- | --- |
| `--source auto\|github\|local` | Select how the project is imported; default `auto` |
| `--model MODEL` | `v0-mini`, `v0-pro`, `v0-max`, or `v0-max-fast`; default `v0-pro` |
| `--privacy PRIVACY` | `private`, `team`, `team-edit`, `unlisted`, or `public`; default `private` |
| `--image-generations` | Allow v0 to generate supporting imagery |
| `--zip-url URL` | Use an already-hosted ZIP URL for local mode |
| `--max-upload-mb NUMBER` | Maximum data-URL ZIP size before inline fallback; default `10` |
| `--dry-run` | Inspect the complete plan without authenticating or uploading |
| `--open`, `--no-open` | Control browser handoff after completion |

### Global options

The naming and aliases intentionally follow the official Vercel CLI:

| Flag | Description |
| --- | --- |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version |
| `--cwd DIR` | Use another working directory |
| `-d`, `--debug` | Enable request and detection diagnostics |
| `--no-color` | Disable color and emoji output |
| `--non-interactive` | Never ask for terminal input |
| `-y`, `--yes` | Accept safe defaults, including v0 plan approval |
| `-S`, `--scope SCOPE` | Set the Vercel scope |
| `-T`, `--team TEAM` | Set the Vercel team slug or ID |
| `--project NAME_OR_ID` | Override the detected Vercel project |
| `-t`, `--token TOKEN` | Supply the v0 API key for this run |
| `-F`, `--format human\|json` | Select output format |
| `-Q`, `--global-config DIR` | Override the global config directory |

In human mode, progress and diagnostics go to stderr while the final v0 chat URL goes to
stdout, which keeps command substitution and piping useful. JSON mode writes one result
object to stdout and suppresses human progress.

## Interactive v0 tasks

v0 can pause generation to present a plan, ask design questions, or request permissions.
The CLI supports all three documented task shapes:

- Plans are shown for approval. `--yes` approves them automatically.
- Questions use terminal select, checkbox, or text prompts.
- Requested permissions require an explicit confirmation and default to denied.
- In non-interactive mode, unresolved questions or permissions are left in the chat and
  its URL is printed so work can continue safely in v0.

## Development

```sh
pnpm install
pnpm dev -- --help
pnpm check
pnpm build
```

`pnpm check` runs strict TypeScript checking, Biome, the Vitest suite, and the bundled CLI
build. See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and
[docs/architecture.md](docs/architecture.md) for the internal flow.

## License

MIT © Sahaj Jain
