import { randomUUID } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { MusicTreeNode, PlaylistNode, TrackNode } from '../../shared/domain/music-tree'
import {
  MAX_PERSISTED_TREE_DEPTH,
  MAX_PERSISTED_TREE_NODE_COUNT
} from '../../shared/domain/app-state'
import { isSupportedMusicPath, uniqueWindowsPaths } from './path-utils'

export interface MusicScanLimits {
  readonly maximumDirectoryDepth: number
  readonly maximumNodeCount: number
}

const defaultScanLimits: MusicScanLimits = {
  maximumDirectoryDepth: MAX_PERSISTED_TREE_DEPTH - 1,
  maximumNodeCount: MAX_PERSISTED_TREE_NODE_COUNT
}

interface ScanBudget {
  nodeCount: number
}

function compareNames(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

function countNode(budget: ScanBudget, limits: MusicScanLimits): void {
  budget.nodeCount += 1
  if (budget.nodeCount > limits.maximumNodeCount) {
    throw new Error(`The imported music tree exceeds ${limits.maximumNodeCount} nodes.`)
  }
}

function createTrack(
  filePath: string,
  budget: ScanBudget,
  limits: MusicScanLimits
): TrackNode {
  countNode(budget, limits)
  return {
    id: randomUUID(),
    type: 'track',
    name: basename(filePath),
    path: filePath
  }
}

async function scanDirectory(
  directoryPath: string,
  depth: number,
  budget: ScanBudget,
  limits: MusicScanLimits
): Promise<PlaylistNode | null> {
  if (depth > limits.maximumDirectoryDepth) {
    throw new Error(
      `The imported folder exceeds ${limits.maximumDirectoryDepth + 1} directory levels.`
    )
  }

  const entries = (await readdir(directoryPath, { withFileTypes: true })).sort(compareNames)
  const children: MusicTreeNode[] = []

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name)
    if (entry.isFile() && isSupportedMusicPath(entry.name)) {
      children.push(createTrack(entryPath, budget, limits))
    } else if (entry.isDirectory()) {
      const playlist = await scanDirectory(entryPath, depth + 1, budget, limits)
      if (playlist) {
        children.push(playlist)
      }
    }
  }

  if (children.length === 0) {
    return null
  }

  countNode(budget, limits)
  return {
    id: randomUUID(),
    type: 'playlist',
    name: basename(directoryPath),
    children
  }
}

export async function scanMusicFolders(
  folderPaths: readonly string[],
  limits: MusicScanLimits = defaultScanLimits
): Promise<PlaylistNode[]> {
  const playlists: PlaylistNode[] = []
  const budget: ScanBudget = { nodeCount: 0 }
  for (const folderPath of uniqueWindowsPaths(folderPaths)) {
    const absolutePath = resolve(folderPath)
    const folderStat = await stat(absolutePath)
    if (!folderStat.isDirectory()) {
      throw new Error(`Not a directory: ${folderPath}`)
    }

    const playlist = await scanDirectory(absolutePath, 0, budget, limits)
    if (playlist) {
      playlists.push(playlist)
    }
  }
  return playlists
}

export async function scanMusicFiles(filePaths: readonly string[]): Promise<TrackNode[]> {
  const tracks: TrackNode[] = []
  const budget: ScanBudget = { nodeCount: 0 }
  for (const filePath of uniqueWindowsPaths(filePaths)) {
    const absolutePath = resolve(filePath)
    if (!isSupportedMusicPath(absolutePath)) {
      continue
    }

    const fileStat = await stat(absolutePath)
    if (fileStat.isFile()) {
      tracks.push(createTrack(absolutePath, budget, defaultScanLimits))
    }
  }
  return tracks
}
