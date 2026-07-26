import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDirectoryMigration, matchRepairCandidates } from './index-repair'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('index repair', () => {
  it('maps an old directory root while preserving relative paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sn-migrate-'))
    temporaryDirectories.push(root)
    const oldRoot = join(root, 'old')
    const newRoot = join(root, 'new')
    await mkdir(join(newRoot, 'Album'), { recursive: true })
    await writeFile(join(newRoot, 'Album', 'Track.mp3'), '')

    const result = await createDirectoryMigration(
      [join(oldRoot, 'Album', 'Track.mp3'), join(oldRoot, 'Missing.flac')],
      oldRoot,
      newRoot
    )

    expect(result.replacements).toEqual([
      {
        oldPath: join(oldRoot, 'Album', 'Track.mp3'),
        newPath: join(newRoot, 'Album', 'Track.mp3')
      }
    ])
    expect(result.unmatchedCount).toBe(1)
  })

  it('matches exact names recursively and preserves requested directory structure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sn-match-'))
    temporaryDirectories.push(root)
    await mkdir(join(root, 'Disc 2'))
    await mkdir(join(root, 'Elsewhere'))
    await writeFile(join(root, 'Disc 2', 'Track.flac'), '')
    await writeFile(join(root, 'Elsewhere', 'Track.flac'), '')
    await writeFile(join(root, 'Direct.mp3'), '')

    const result = await matchRepairCandidates(root, [
      {
        key: 'structured',
        oldPath: 'C:\\Old\\Track.flac',
        fileName: 'Track.flac',
        relativeDirectory: ['Disc 2']
      },
      {
        key: 'ambiguous',
        oldPath: 'C:\\Old\\Other\\Track.flac',
        fileName: 'Track.flac',
        relativeDirectory: null
      },
      {
        key: 'direct',
        oldPath: 'C:\\Old\\Direct.mp3',
        fileName: 'Direct.mp3',
        relativeDirectory: []
      }
    ])

    expect(result.replacements.map((replacement) => replacement.key)).toEqual([
      'structured',
      'direct'
    ])
    expect(result.ambiguousKeys).toEqual(['ambiguous'])
    expect(result.unmatchedKeys).toEqual([])
  })
})
