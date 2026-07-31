import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)

const version = await execute(process.execPath, ['dist/cli.js', '--version'])
assert.equal(version.stdout, `${manifest.version}\n`)

const help = await execute(process.execPath, ['dist/cli.js', '--help'])
assert.match(help.stdout, /v0-reimagine \[prompt\] \[options\]/)
assert.match(help.stdout, /--source MODE/)
