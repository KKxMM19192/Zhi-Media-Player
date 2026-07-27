import { isAbsolute, win32 } from 'node:path'
import {
  APP_STATE_SCHEMA_VERSION,
  MAX_PERSISTED_TOTAL_NODE_COUNT,
  MAX_PERSISTED_TREE_DEPTH,
  MAX_PERSISTED_TREE_NODE_COUNT,
  type PersistedAppState
} from '../../shared/domain/app-state'
import { findNode, flattenTracks, type MusicTreeNode } from '../../shared/domain/music-tree'
import {
  DEFAULT_QUEUE_HISTORY_LIMIT,
  MAX_SAVED_QUEUE_COUNT,
  type QueueHistoryEntry,
  type QueueHistoryReason,
  type SavedQueue,
  type ShuffleState
} from '../../shared/domain/queue-state'
import type { PlaybackMode } from '../../shared/domain/playback'

const playbackModes = new Set<PlaybackMode>(['sequential', 'repeat-all', 'repeat-one', 'shuffle'])
const historyReasons = new Set<QueueHistoryReason>(['replace', 'clear', 'restore', 'shuffle-exit'])

interface NodeCounter {
  value: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbsoluteOnAnyPlatform(filePath: string): boolean {
  return isAbsolute(filePath) || win32.isAbsolute(filePath)
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validateNodes(
  value: unknown,
  globalIds: Set<string>,
  totalCounter: NodeCounter,
  depth = 0,
  treeCounter: NodeCounter = { value: 0 }
): value is MusicTreeNode[] {
  if (!Array.isArray(value) || depth > MAX_PERSISTED_TREE_DEPTH) {
    return false
  }

  return value.every((node) => {
    treeCounter.value += 1
    totalCounter.value += 1
    if (
      treeCounter.value > MAX_PERSISTED_TREE_NODE_COUNT ||
      totalCounter.value > MAX_PERSISTED_TOTAL_NODE_COUNT ||
      !isRecord(node) ||
      !isValidId(node.id) ||
      globalIds.has(node.id) ||
      typeof node.name !== 'string' ||
      node.name.length === 0 ||
      node.name.length > 1024
    ) {
      return false
    }

    globalIds.add(node.id)
    if (node.type === 'track') {
      return (
        typeof node.path === 'string' &&
        node.path.length > 0 &&
        node.path.length <= 32_768 &&
        isAbsoluteOnAnyPlatform(node.path)
      )
    }
    return (
      node.type === 'playlist' &&
      validateNodes(node.children, globalIds, totalCounter, depth + 1, treeCounter)
    )
  })
}

function validateSavedQueues(
  value: unknown,
  globalIds: Set<string>,
  totalCounter: NodeCounter
): value is SavedQueue[] {
  if (!Array.isArray(value) || value.length > MAX_SAVED_QUEUE_COUNT) {
    return false
  }

  return value.every((savedQueue) => {
    if (
      !isRecord(savedQueue) ||
      !isValidId(savedQueue.id) ||
      globalIds.has(savedQueue.id) ||
      typeof savedQueue.name !== 'string' ||
      savedQueue.name.trim().length === 0 ||
      savedQueue.name.length > 1024 ||
      !isValidTimestamp(savedQueue.createdAt) ||
      !isValidTimestamp(savedQueue.updatedAt) ||
      savedQueue.updatedAt < savedQueue.createdAt
    ) {
      return false
    }
    globalIds.add(savedQueue.id)
    return validateNodes(savedQueue.nodes, globalIds, totalCounter)
  })
}

function validateQueueHistory(
  value: unknown,
  globalIds: Set<string>,
  totalCounter: NodeCounter
): value is QueueHistoryEntry[] {
  if (!Array.isArray(value) || value.length > DEFAULT_QUEUE_HISTORY_LIMIT) {
    return false
  }

  let previousTimestamp = -1
  return value.every((entry) => {
    if (
      !isRecord(entry) ||
      !isValidId(entry.id) ||
      globalIds.has(entry.id) ||
      !isValidTimestamp(entry.createdAt) ||
      entry.createdAt < previousTimestamp ||
      typeof entry.reason !== 'string' ||
      !historyReasons.has(entry.reason as QueueHistoryReason)
    ) {
      return false
    }
    previousTimestamp = entry.createdAt
    globalIds.add(entry.id)
    return validateNodes(entry.nodes, globalIds, totalCounter)
  })
}

function validateShuffle(
  value: unknown,
  queue: readonly MusicTreeNode[],
  globalIds: Set<string>,
  totalCounter: NodeCounter
): value is ShuffleState | null {
  if (value === null) {
    return true
  }
  if (!isRecord(value) || queue.some((node) => node.type !== 'track')) {
    return false
  }

  if (
    !validateNodes(value.originalQueue, globalIds, totalCounter) ||
    !isRecord(value.originalTrackIdByShuffledTrackId)
  ) {
    return false
  }
  const originalTrackIds = new Set(
    flattenTracks(value.originalQueue).map((track) => track.id)
  )
  const mappedOriginalIds = new Set<string>()
  for (const [shuffledTrackId, originalTrackId] of Object.entries(
    value.originalTrackIdByShuffledTrackId
  )) {
    if (
      !isValidId(shuffledTrackId) ||
      !isValidId(originalTrackId) ||
      !originalTrackIds.has(originalTrackId) ||
      mappedOriginalIds.has(originalTrackId)
    ) {
      return false
    }
    mappedOriginalIds.add(originalTrackId)
  }
  return (
    mappedOriginalIds.size === originalTrackIds.size &&
    [...originalTrackIds].every((trackId) => mappedOriginalIds.has(trackId))
  )
}

function migrateSchemaVersionOne(value: Record<string, unknown>): Record<string, unknown> {
  const playback =
    isRecord(value.playback) && value.playback.mode === 'shuffle'
      ? {
          ...value.playback,
          // Schema v1 treated shuffle advancement like repeat-all and had no restorable shuffle snapshot.
          mode: 'repeat-all'
        }
      : value.playback
  return {
    ...value,
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    savedQueues: [],
    queueHistory: [],
    shuffle: null,
    playback
  }
}

export function parsePersistedAppState(value: unknown): PersistedAppState {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== APP_STATE_SCHEMA_VERSION)) {
    throw new Error('Unsupported or missing application state schema version.')
  }

  const candidate = value.schemaVersion === 1 ? migrateSchemaVersionOne(value) : value
  const globalIds = new Set<string>()
  const totalCounter = { value: 0 }
  if (
    !validateNodes(candidate.library, globalIds, totalCounter) ||
    !validateNodes(candidate.queue, globalIds, totalCounter) ||
    !validateSavedQueues(candidate.savedQueues, globalIds, totalCounter) ||
    !validateQueueHistory(candidate.queueHistory, globalIds, totalCounter) ||
    !validateShuffle(
      candidate.shuffle,
      candidate.queue as MusicTreeNode[],
      globalIds,
      totalCounter
    )
  ) {
    throw new Error('Application state contains an invalid music collection.')
  }

  const playback = candidate.playback
  if (
    !isRecord(playback) ||
    (playback.currentTrackId !== null && typeof playback.currentTrackId !== 'string') ||
    typeof playback.positionSeconds !== 'number' ||
    !Number.isFinite(playback.positionSeconds) ||
    playback.positionSeconds < 0 ||
    typeof playback.volume !== 'number' ||
    !Number.isFinite(playback.volume) ||
    playback.volume < 0 ||
    playback.volume > 1 ||
    typeof playback.paused !== 'boolean' ||
    typeof playback.mode !== 'string' ||
    !playbackModes.has(playback.mode as PlaybackMode)
  ) {
    throw new Error('Application state contains an invalid playback snapshot.')
  }

  const context = playback.context
  if (
    context !== null &&
    (!isRecord(context) ||
      (context.source !== 'library' && context.source !== 'queue') ||
      (context.containerId !== null && typeof context.containerId !== 'string'))
  ) {
    throw new Error('Application state contains an invalid playback context.')
  }

  if ((playback.currentTrackId === null) !== (context === null)) {
    throw new Error('Application state contains an incomplete playback cursor.')
  }
  if (playback.currentTrackId && context) {
    const roots = context.source === 'queue' ? candidate.queue : candidate.library
    const currentNode = findNode(roots as MusicTreeNode[], playback.currentTrackId)
    if (!currentNode || currentNode.type !== 'track') {
      throw new Error('Application state points to a missing current track.')
    }
  }

  if ((playback.mode === 'shuffle') !== (candidate.shuffle !== null)) {
    throw new Error('Application state contains an inconsistent shuffle snapshot.')
  }

  if (
    !Array.isArray(candidate.expandedNodeIds) ||
    !candidate.expandedNodeIds.every((nodeId) => typeof nodeId === 'string')
  ) {
    throw new Error('Application state contains invalid expanded node identifiers.')
  }

  return candidate as unknown as PersistedAppState
}
