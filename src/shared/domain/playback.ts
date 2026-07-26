import {
  findNode,
  findNodeLocation,
  flattenTracks,
  type MusicTreeNode,
  type NodeId,
  type TrackNode
} from './music-tree'

export type PlaybackMode = 'sequential' | 'repeat-all' | 'repeat-one' | 'shuffle'
export type PlaybackSource = 'library' | 'queue'

export interface PlaybackContext {
  readonly source: PlaybackSource
  readonly containerId: NodeId | null
}

export function getQueuePlaybackOrder(queue: readonly MusicTreeNode[]): TrackNode[] {
  return flattenTracks(queue)
}

export function getLibraryDirectPlaybackOrder(
  library: readonly MusicTreeNode[],
  trackId: NodeId
): TrackNode[] {
  const location = findNodeLocation(library, trackId)
  if (!location) {
    return []
  }

  if (location.parentId === null) {
    return library.filter((node): node is TrackNode => node.type === 'track')
  }

  const parent = findNode(library, location.parentId)
  return parent?.type === 'playlist'
    ? parent.children.filter((node): node is TrackNode => node.type === 'track')
    : []
}

export function getPlaybackOrder(
  library: readonly MusicTreeNode[],
  queue: readonly MusicTreeNode[],
  context: PlaybackContext,
  currentTrackId: NodeId
): TrackNode[] {
  return context.source === 'queue'
    ? getQueuePlaybackOrder(queue)
    : getLibraryDirectPlaybackOrder(library, currentTrackId)
}

export function getAdjacentTrack(
  order: readonly TrackNode[],
  currentTrackId: NodeId,
  direction: -1 | 1,
  mode: PlaybackMode
): TrackNode | undefined {
  const currentIndex = order.findIndex((track) => track.id === currentTrackId)
  if (currentIndex < 0 || order.length === 0) {
    return undefined
  }

  if (mode === 'repeat-one') {
    return order[currentIndex]
  }

  const nextIndex = currentIndex + direction
  if (nextIndex >= 0 && nextIndex < order.length) {
    return order[nextIndex]
  }

  if (mode === 'repeat-all' || mode === 'shuffle') {
    return direction === 1 ? order[0] : order.at(-1)
  }

  return undefined
}
