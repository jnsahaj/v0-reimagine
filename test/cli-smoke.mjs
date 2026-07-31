import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execute = promisify(execFile)

const version = await execute(process.execPath, ['dist/cli.js', '--version'])
assert.match(version.stdout, /^0\.1\.0\n$/)

const help = await execute(process.execPath, ['dist/cli.js', '--help'])
assert.match(help.stdout, /v0-reimagine \[prompt\] \[options\]/)
assert.match(help.stdout, /--source MODE/)
