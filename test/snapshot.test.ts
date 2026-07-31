import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createSnapshot,
  snapshotAsDataUrl,
  snapshotAsInlineFiles,
} from '../src/project/snapshot.js'

describe('createSnapshot', () => {
  it('honors ignore files and excludes credential files while retaining examples', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v0-reimagine-snapshot-'))
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'node_modules'))
    await writeFile(
      join(root, 'src/app.tsx'),
      'export const App = () => <main>Hello</main>',
    )
    await writeFile(join(root, 'src/ignored.ts'), 'do not upload')
    await writeFile(join(root, '.v0reimagineignore'), 'src/ignored.ts\n')
    await writeFile(join(root, '.env'), 'DATABASE_URL=secret')
    await writeFile(join(root, '.env.example'), 'DATABASE_URL=')
    await writeFile(join(root, 'node_modules/package.js'), 'excluded')

    const snapshot = await createSnapshot(root)
    const paths = snapshot.files.map((file) => file.path)

    expect(paths).toContain('src/app.tsx')
    expect(paths).toContain('.env.example')
    expect(paths).not.toContain('.env')
    expect(paths).not.toContain('src/ignored.ts')
    expect(paths).not.toContain('node_modules/package.js')
    expect(snapshot.excluded).toContain('.env (credential file)')
    expect(snapshotAsDataUrl(snapshot)).toMatch(/^data:application\/zip;base64,/)
    expect(snapshotAsInlineFiles(snapshot).map((file) => file.name)).toContain(
      'src/app.tsx',
    )
  })

  it('warns about likely embedded secrets without printing their values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v0-reimagine-warning-'))
    const fakeToken = ['ghp', 'abcdefghijklmnopqrstuvwxyz123456'].join('_')
    await writeFile(join(root, 'config.ts'), `export const token = '${fakeToken}'`)

    const snapshot = await createSnapshot(root)

    expect(snapshot.secretWarnings).toEqual(['config.ts: possible GitHub token'])
    expect(JSON.stringify(snapshot.secretWarnings)).not.toContain(fakeToken)
  })
})
