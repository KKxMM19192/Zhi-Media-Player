import {
  cloneTree,
  cloneTreeWithIdMap,
  cloneTreeWithNewIds,
  createNodeId,
  findNode,
  flattenTracks,
  treesHaveSameContent,
  type MusicTreeNode,
  type NodeId,
  type NodeIdFactory,
  type TrackNode
} from './music-tree'

export const DEFAULT_QUEUE_HISTORY_LIMIT = 10
export const MAX_SAVED_QUEUE_COUNT = 100

export type QueueHistoryReason = 'replace' | 'clear' | 'restore' | 'shuffle-exit'

export interface SavedQueue {
  readonly id: NodeId
  readonly name: string
  readonly nodes: MusicTreeNode[]
  readonly createdAt: number
  readonly updatedAt: number
}

export interface QueueHistoryEntry {
  readonly id: NodeId
  readonly createdAt: number
  readonly reason: QueueHistoryReason
  readonly nodes: MusicTreeNode[]
}

export interface ShuffleState {
  readonly originalQueue: MusicTreeNode[]
  readonly originalTrackIdByShuffledTrackId: Readonly<Record<NodeId, NodeId>>
}

export interface HistoryOptions {
  readonly limit?: number
  readonly idFactory?: NodeIdFactory
  readonly now?: () => number
  readonly protectedEntryId?: NodeId
}

export interface ShuffleExitResult {
  readonly queue: MusicTreeNode[]
  readonly history: QueueHistoryEntry[]
  readonly currentTrackId: NodeId | null
}

export interface ShuffleOptions {
  readonly random?: () => number
  readonly idFactory?: NodeIdFactory
}

export function createSavedQueue(
  name: string,
  nodes: readonly MusicTreeNode[],
  options: Pick<HistoryOptions, 'idFactory' | 'now'> = {}
): SavedQueue {
  const idFactory = options.idFactory ?? createNodeId
  const timestamp = (options.now ?? Date.now)()
  return {
    id: idFactory(),
    name,
    nodes: cloneTreeWithNewIds(nodes, idFactory),
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

export function updateSavedQueue(
  savedQueue: SavedQueue,
  nodes: readonly MusicTreeNode[],
  now: () => number = Date.now
): SavedQueue {
  return {
    ...savedQueue,
    nodes: cloneTree(nodes),
    updatedAt: now()
  }
}

export function appendQueueHistory(
  history: readonly QueueHistoryEntry[],
  nodes: readonly MusicTreeNode[],
  reason: QueueHistoryReason,
  options: HistoryOptions = {}
): QueueHistoryEntry[] {
  const limit = options.limit ?? DEFAULT_QUEUE_HISTORY_LIMIT
  if (limit <= 0) {
    return []
  }
  const latest = history.at(-1)
  if (latest && treesHaveSameContent(latest.nodes, nodes)) {
    return [...history]
  }

  const idFactory = options.idFactory ?? createNodeId
  let next = [
    ...history,
    {
      id: idFactory(),
      createdAt: (options.now ?? Date.now)(),
      reason,
      nodes: cloneTreeWithNewIds(nodes, idFactory)
    }
  ]
  while (next.length > limit) {
    const removableIndex = next.findIndex((entry) => entry.id !== options.protectedEntryId)
    if (removableIndex < 0) {
      break
    }
    next = [...next.slice(0, removableIndex), ...next.slice(removableIndex + 1)]
  }
  return next
}

export function createShuffledQueue(
  queue: readonly MusicTreeNode[],
  random: () => number = Math.random
): TrackNode[] {
  const shuffled = flattenTracks(cloneTree(queue))
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    const temporary = shuffled[index]
    shuffled[index] = shuffled[randomIndex]
    shuffled[randomIndex] = temporary
  }
  return shuffled
}

export function enterShuffle(
  queue: readonly MusicTreeNode[],
  options: ShuffleOptions = {}
): {
  queue: TrackNode[]
  shuffle: ShuffleState
  originalNodeIdByQueueNodeId: Readonly<Record<NodeId, NodeId>>
} {
  const original = cloneTreeWithIdMap(queue, options.idFactory)
  const originalTrackIdByShuffledTrackId = Object.create(null) as Record<NodeId, NodeId>
  flattenTracks(queue).forEach((track) => {
    originalTrackIdByShuffledTrackId[track.id] = original.clonedIdByOriginalId[track.id]
  })
  return {
    queue: createShuffledQueue(queue, options.random),
    originalNodeIdByQueueNodeId: original.clonedIdByOriginalId,
    shuffle: {
      originalQueue: original.nodes,
      originalTrackIdByShuffledTrackId
    }
  }
}

export function exitShuffle(
  shuffledQueue: readonly MusicTreeNode[],
  shuffle: ShuffleState,
  history: readonly QueueHistoryEntry[],
  currentTrackId: NodeId | null,
  options: HistoryOptions = {}
): ShuffleExitResult {
  const restoredQueue = cloneTree(shuffle.originalQueue)
  const restoredCurrentId = currentTrackId
    ? shuffle.originalTrackIdByShuffledTrackId[currentTrackId]
    : undefined
  const restoredCurrent = restoredCurrentId
    ? findNode(restoredQueue, restoredCurrentId)
    : undefined
  return {
    queue: restoredQueue,
    history: appendQueueHistory(history, shuffledQueue, 'shuffle-exit', options),
    currentTrackId:
      restoredCurrent?.type === 'track' ? restoredCurrent.id : null
  }
}
