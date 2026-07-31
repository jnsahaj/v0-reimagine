# Contributing

Contributions are welcome. Please open an issue before a large behavior or command-surface
change so the UX can be agreed on first.

## Local setup

```sh
corepack enable
pnpm install
pnpm check
```

Node.js 20 or newer and the package-manager version declared in `package.json` are
supported. Use `pnpm dev -- [arguments]` to run the TypeScript entrypoint and `pnpm build`
to create the distributable `dist/cli.js`.

## Pull requests

- Add or update tests for behavior changes.
- Preserve stdout for result data and stderr for human progress.
- Keep new flags consistent with Vercel CLI terminology when an equivalent exists.
- Never weaken snapshot credential exclusions or permission confirmations without an
  explicit security rationale.
- Run `pnpm check` before opening the pull request.

Do not include v0 keys, Vercel tokens, real `.vercel` link files, or private project
snapshots in fixtures or bug reports.
