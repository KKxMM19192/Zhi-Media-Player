import { isAbsolute, win32 } from 'node:path'
import {
  APP_STATE_SCHEMA_VERSION,
  MAX_PERSISTED_TREE_DEPTH,
  MAX_PERSISTED_TREE_NODE_COUNT,
  type PersistedAppState
} from '../../shared/domain/app-state'
import type { MusicTreeNode } from '../../shared/domain/music-tree'
import { findNode } from '../../shared/domain/music-tree'
import type { PlaybackMode } from '../../shared/domain/playback'

const playbackModes = new Set<PlaybackMode>(['sequential', 'repeat-all', 'repeat-one', 'shuffle'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbsoluteOnAnyPlatform(filePath: string): boolean {
  return isAbsolute(filePath) || win32.isAbsolute(filePath)
}

function validateNodes(
  value: unknown,
  ids: Set<string>,
  depth = 0,
  counter = { value: 0 }
): value is MusicTreeNode[] {
  if (!Array.isArray(value) || depth > MAX_PERSISTED_TREE_DEPTH) {
    return false
  }

  return value.every((node) => {
    counter.value += 1
    if (
      counter.value > MAX_PERSISTED_TREE_NODE_COUNT ||
      !isRecord(node) ||
      typeof node.id !== 'string' ||
      node.id.length === 0 ||
      node.id.length > 128 ||
      ids.has(node.id) ||
      typeof node.name !== 'string' ||
      node.name.length === 0 ||
      node.name.length > 1024
    ) {
      return false
    }

    ids.add(node.id)
    if (node.type === 'track') {
      return (
        typeof node.path === 'string' &&
        node.path.length <= 32_768 &&
        isAbsoluteOnAnyPlatform(node.path)
      )
    }
    return node.type === 'playlist' && validateNodes(node.children, ids, depth + 1, counter)
  })
}

export function parsePersistedAppState(value: unknown): PersistedAppState {
  if (!isRecord(value) || value.schemaVersion !== APP_STATE_SCHEMA_VERSION) {
    throw new Error('Unsupported or missing application state schema version.')
  }

  const ids = new Set<string>()
  if (!validateNodes(value.library, ids) || !validateNodes(value.queue, ids)) {
    throw new Error('Application state contains an invalid music tree.')
  }

  const playback = value.playback
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
    const roots = context.source === 'queue' ? value.queue : value.library
    const currentNode = findNode(roots as MusicTreeNode[], playback.currentTrackId)
    if (!currentNode || currentNode.type !== 'track') {
      throw new Error('Application state points to a missing current track.')
    }
  }

  if (
    !Array.isArray(value.expandedNodeIds) ||
    !value.expandedNodeIds.every((nodeId) => typeof nodeId === 'string')
  ) {
    throw new Error('Application state contains invalid expanded node identifiers.')
  }

  return value as unknown as PersistedAppState
}
