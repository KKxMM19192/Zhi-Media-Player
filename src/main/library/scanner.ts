import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { MusicTreeNode, PlaylistNode, TrackNode } from '../../shared/domain/music-tree'
import { isSupportedMusicPath, uniqueWindowsPaths } from './path-utils'

function compareNames(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

function createTrack(filePath: string): TrackNode {
  return {
    id: randomUUID(),
    type: 'track',
    name: basename(filePath),
    path: filePath
  }
}

async function scanDirectory(directoryPath: string): Promise<PlaylistNode | null> {
  const entries = (await readdir(directoryPath, { withFileTypes: true })).sort(compareNames)
  const children: MusicTreeNode[] = []

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name)
    if (entry.isFile() && isSupportedMusicPath(entry.name)) {
      children.push(createTrack(entryPath))
    } else if (entry.isDirectory()) {
      const playlist = await scanDirectory(entryPath)
      if (playlist) {
        children.push(playlist)
      }
    }
  }

  if (children.length === 0) {
    return null
  }

  return {
    id: randomUUID(),
    type: 'playlist',
    name: basename(directoryPath),
    children
  }
}

export async function scanMusicFolders(folderPaths: readonly string[]): Promise<PlaylistNode[]> {
  const playlists: PlaylistNode[] = []
  for (const folderPath of uniqueWindowsPaths(folderPaths)) {
    const absolutePath = resolve(folderPath)
    const folderStat = await stat(absolutePath)
    if (!folderStat.isDirectory()) {
      throw new Error(`Not a directory: ${folderPath}`)
    }

    const playlist = await scanDirectory(absolutePath)
    if (playlist) {
      playlists.push(playlist)
    }
  }
  return playlists
}

export async function scanMusicFiles(filePaths: readonly string[]): Promise<TrackNode[]> {
  const tracks: TrackNode[] = []
  for (const filePath of uniqueWindowsPaths(filePaths)) {
    const absolutePath = resolve(filePath)
    if (!isSupportedMusicPath(absolutePath)) {
      continue
    }

    const fileStat = await stat(absolutePath)
    if (fileStat.isFile()) {
      tracks.push(createTrack(absolutePath))
    }
  }
  return tracks
}
