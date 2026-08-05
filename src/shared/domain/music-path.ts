import { mapTracks, type MusicTreeNode, type NodeId } from './music-tree'

export interface TrackPathReplacement {
  readonly oldPath: string
  readonly newPath: string
  readonly newName?: string
}

export function normalizeMusicPathForComparison(filePath: string): string {
  return filePath
    .trim()
    .replaceAll('/', '\\')
    .replace(/[\\]+$/, '')
    .toLocaleLowerCase('en-US')
}

export function musicPathsEqual(left: string, right: string): boolean {
  return normalizeMusicPathForComparison(left) === normalizeMusicPathForComparison(right)
}

export function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replaceAll('/', '\\')
  return normalized.slice(normalized.lastIndexOf('\\') + 1)
}

export function replaceTrackPaths(
  nodes: readonly MusicTreeNode[],
  replacements: readonly TrackPathReplacement[]
): MusicTreeNode[] {
  const replacementsByPath = new Map(
    replacements.map((replacement) => [
      normalizeMusicPathForComparison(replacement.oldPath),
      replacement
    ])
  )
  return mapTracks(nodes, (track) => {
    const replacement = replacementsByPath.get(normalizeMusicPathForComparison(track.path))
    return replacement
      ? {
          ...track,
          path: replacement.newPath,
          name: replacement.newName ?? fileNameFromPath(replacement.newPath)
        }
      : track
  })
}

export function replaceTrackPathById(
  nodes: readonly MusicTreeNode[],
  trackId: NodeId,
  newPath: string,
  newName: string = fileNameFromPath(newPath)
): MusicTreeNode[] {
  return mapTracks(nodes, (track) =>
    track.id === trackId ? { ...track, path: newPath, name: newName } : track
  )
}
