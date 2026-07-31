import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createSnapshot,
  snapshotAsDataUrl,
  snapshotAsInlineFiles,
  V0_FILE_LIMIT,
  validateSnapshotLimits,
} from '../src/project/snapshot.js'
import type { ProjectSnapshot, SnapshotFile } from '../src/types.js'

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

  it('recursively excludes nested worktrees, dependencies, and build output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v0-reimagine-nested-'))
    await mkdir(join(root, '.worktrees/pr/app'), { recursive: true })
    await mkdir(join(root, 'packages/ui/node_modules/pkg'), { recursive: true })
    await mkdir(join(root, 'apps/web/.next/server'), { recursive: true })
    await writeFile(join(root, 'app.ts'), 'export const app = true')
    await writeFile(join(root, '.worktrees/pr/app/page.tsx'), 'duplicate')
    await writeFile(join(root, 'packages/ui/node_modules/pkg/index.js'), 'generated')
    await writeFile(join(root, 'apps/web/.next/server/page.js'), 'generated')

    const snapshot = await createSnapshot(root)

    expect(snapshot.files.map((file) => file.path)).toEqual(['app.ts'])
  })

  it('rejects snapshots over v0 limits instead of silently truncating them', () => {
    const files = Array.from({ length: V0_FILE_LIMIT + 1 }, (_, index) =>
      snapshotFile(`src/file-${index}.ts`),
    )
    const snapshot = projectSnapshot(files)

    expect(() => validateSnapshotLimits(snapshot)).toThrow(
      'v0 supports at most 1000 files per chat',
    )
    expect(() => snapshotAsInlineFiles(snapshot)).not.toThrow()
    expect(snapshotAsInlineFiles(snapshot)).toHaveLength(V0_FILE_LIMIT + 1)
  })
})

function snapshotFile(path: string, content = 'export {}'): SnapshotFile {
  const encoded = Buffer.from(content)
  return {
    absolutePath: `/project/${path}`,
    binary: false,
    content: encoded,
    path,
    size: encoded.byteLength,
  }
}

function projectSnapshot(files: SnapshotFile[]): ProjectSnapshot {
  return {
    archive: new Uint8Array(),
    excluded: [],
    files,
    secretWarnings: [],
    totalBytes: files.reduce((total, file) => total + file.size, 0),
  }
}
