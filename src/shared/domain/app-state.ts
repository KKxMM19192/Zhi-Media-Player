import type { MusicTreeNode, NodeId } from './music-tree'
import type { PlaybackContext, PlaybackMode } from './playback'

export const APP_STATE_SCHEMA_VERSION = 1 as const

export interface PlaybackSnapshot {
  readonly currentTrackId: NodeId | null
  readonly context: PlaybackContext | null
  readonly positionSeconds: number
  readonly volume: number
  readonly mode: PlaybackMode
  readonly paused: boolean
}

export interface PersistedAppState {
  readonly schemaVersion: typeof APP_STATE_SCHEMA_VERSION
  readonly library: MusicTreeNode[]
  readonly queue: MusicTreeNode[]
  readonly playback: PlaybackSnapshot
  readonly expandedNodeIds: NodeId[]
}

export function createDefaultAppState(): PersistedAppState {
  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    library: [],
    queue: [],
    playback: {
      currentTrackId: null,
      context: null,
      positionSeconds: 0,
      volume: 0.8,
      mode: 'sequential',
      paused: true
    },
    expandedNodeIds: []
  }
}
