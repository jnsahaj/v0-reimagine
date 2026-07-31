import { chmod, mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const outfile = resolve(root, 'dist/cli.js')

await mkdir(dirname(outfile), { recursive: true })
await build({
  entryPoints: [resolve(root, 'src/cli.ts')],
  outfile,
  bundle: true,
  packages: 'external',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
  define: { __CLI_VERSION__: JSON.stringify(manifest.version) },
})
await chmod(outfile, 0o755)
