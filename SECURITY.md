# Security policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private
security advisory flow for this repository and include the affected version, a minimal
reproduction, and the potential impact. Please avoid including real credentials or private
source code in the report.

## Credential and source handling

- v0 API keys supplied through `--token` or `V0_API_KEY` are used only for that process.
- Saved keys live in the selected config directory as `auth.json` with mode `0600`; the
  directory is mode `0700` on POSIX systems.
- Local uploads exclude known credential files and scan small text files for common
  embedded secret formats. Pattern matching is defense in depth, not a substitute for
  reviewing `v0-reimagine --dry-run` and maintaining `.v0reimagineignore`.
- GitHub mode sends a repository URL and branch to v0. Local mode sends source contents to
  v0 through its Platform API. Consult v0's terms and privacy policy before using the CLI
  with sensitive or regulated code.

Only use API keys with the minimum access appropriate to your account, rotate any key that
may have been exposed, and prefer environment variables in CI.
