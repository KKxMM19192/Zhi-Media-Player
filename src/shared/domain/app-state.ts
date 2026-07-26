import type { MusicTreeNode, NodeId } from './music-tree'
import type { PlaybackContext, PlaybackMode } from './playback'
import type { QueueHistoryEntry, SavedQueue, ShuffleState } from './queue-state'

export const APP_STATE_SCHEMA_VERSION = 2 as const
export const MAX_PERSISTED_TREE_DEPTH = 64
export const MAX_PERSISTED_TREE_NODE_COUNT = 50_000
export const MAX_PERSISTED_TOTAL_NODE_COUNT = 500_000

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
  readonly savedQueues: SavedQueue[]
  readonly queueHistory: QueueHistoryEntry[]
  readonly shuffle: ShuffleState | null
  readonly playback: PlaybackSnapshot
  readonly expandedNodeIds: NodeId[]
}

export function createDefaultAppState(): PersistedAppState {
  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    library: [],
    queue: [],
    savedQueues: [],
    queueHistory: [],
    shuffle: null,
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
