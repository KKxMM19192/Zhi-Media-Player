import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { flattenTracks } from '../../shared/domain/music-tree'
import { scanMusicFolders } from './scanner'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('music folder scanner', () => {
  it('preserves nested folders and prunes branches without supported music', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sn-scan-'))
    temporaryDirectories.push(root)
    await mkdir(join(root, 'Disc 2'))
    await mkdir(join(root, 'Images'))
    await writeFile(join(root, 'Track 01.FLAC'), '')
    await writeFile(join(root, 'Disc 2', 'Track 02.mp3'), '')
    await writeFile(join(root, 'Images', 'cover.png'), '')

    const [playlist] = await scanMusicFolders([root])

    expect(playlist.children.map((node) => node.name)).toEqual(['Disc 2', 'Track 01.FLAC'])
    expect(
      playlist.children.some((node) => node.type === 'playlist' && node.name === 'Images')
    ).toBe(false)
    expect(flattenTracks([playlist]).map((track) => track.name)).toEqual([
      'Track 02.mp3',
      'Track 01.FLAC'
    ])
  })

  it('omits a completely empty music folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sn-scan-empty-'))
    temporaryDirectories.push(root)
    await writeFile(join(root, 'notes.txt'), '')

    expect(await scanMusicFolders([root])).toEqual([])
  })

  it('rejects imports that exceed the persisted tree node limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sn-scan-limit-'))
    temporaryDirectories.push(root)
    await writeFile(join(root, 'A.mp3'), '')
    await writeFile(join(root, 'B.mp3'), '')

    await expect(
      scanMusicFolders([root], { maximumDirectoryDepth: 63, maximumNodeCount: 2 })
    ).rejects.toThrow(/exceeds 2 nodes/)
  })
})
