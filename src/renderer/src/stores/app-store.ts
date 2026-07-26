import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  APP_STATE_SCHEMA_VERSION,
  MAX_PERSISTED_TREE_NODE_COUNT,
  createDefaultAppState,
  type PersistedAppState
} from '../../../shared/domain/app-state'
import {
  cloneTree,
  cloneTreeWithIdMap,
  cloneTreeWithNewIds,
  collectSubtreeIds,
  containsAnyNode,
  createNodeId,
  findNode,
  findNodeLocation,
  flattenTracks,
  flattenTree,
  insertNodes,
  isWithinTreeNodeLimit,
  moveNodes,
  normalizeSelectedRootIds,
  removeNodes,
  toggleNodeSelection,
  type MusicTreeNode,
  type NodeId,
  type PlaylistNode,
  type TrackNode,
  type TreeDestination
} from '../../../shared/domain/music-tree'
import {
  fileNameFromPath,
  musicPathsEqual,
  normalizeMusicPathForComparison,
  replaceTrackPathById,
  replaceTrackPaths,
  type TrackPathReplacement
} from '../../../shared/domain/music-path'
import {
  getAdjacentTrack,
  getNextPlaybackMode,
  getPlaybackOrder,
  type PlaybackAdvanceCause,
  type PlaybackContext,
  type PlaybackMode,
  type PlaybackSource
} from '../../../shared/domain/playback'
import {
  MAX_SAVED_QUEUE_COUNT,
  appendQueueHistory,
  createSavedQueue,
  enterShuffle,
  exitShuffle,
  updateSavedQueue,
  type QueueHistoryEntry,
  type SavedQueue,
  type ShuffleState
} from '../../../shared/domain/queue-state'
import type { FolderMatchCandidate } from '../../../shared/contracts/app-api'

export type AppPage = 'library' | 'queue'
export type QueueSection = 'current' | 'saved' | 'history'
export type TreeSource = 'library' | 'queue' | 'saved'

export type DragPayload =
  | {
      readonly kind: 'nodes'
      readonly source: TreeSource
      readonly savedQueueId: NodeId | null
      readonly nodeIds: NodeId[]
    }
  | {
      readonly kind: 'saved-queue'
      readonly savedQueueId: NodeId
    }

function getSelectedNodes(
  nodes: readonly MusicTreeNode[],
  selectedIds: ReadonlySet<NodeId>
): MusicTreeNode[] {
  return normalizeSelectedRootIds(nodes, selectedIds)
    .map((nodeId) => findNode(nodes, nodeId))
    .filter((node): node is MusicTreeNode => node !== undefined)
}

function createTransferableTree(nodes: readonly MusicTreeNode[]): MusicTreeNode[] {
  return nodes.map((node) =>
    node.type === 'track'
      ? {
          id: node.id,
          type: node.type,
          name: node.name,
          path: node.path
        }
      : {
          id: node.id,
          type: node.type,
          name: node.name,
          children: createTransferableTree(node.children)
        }
  )
}

function directChildrenAt(
  nodes: readonly MusicTreeNode[],
  parentId: NodeId | null
): readonly MusicTreeNode[] {
  if (parentId === null) {
    return nodes
  }
  const parent = findNode(nodes, parentId)
  return parent?.type === 'playlist' ? parent.children : []
}

function removeDuplicateDirectTracks(
  roots: readonly MusicTreeNode[],
  additions: readonly MusicTreeNode[],
  destination: TreeDestination
): { nodes: MusicTreeNode[]; skippedCount: number } {
  const directPaths = directChildrenAt(roots, destination.parentId)
    .filter((node): node is TrackNode => node.type === 'track')
    .map((track) => track.path)
  const acceptedPaths = [...directPaths]
  const nodes = additions.filter((node) => {
    if (node.type === 'playlist') {
      return true
    }
    if (acceptedPaths.some((path) => musicPathsEqual(path, node.path))) {
      return false
    }
    acceptedPaths.push(node.path)
    return true
  })
  return { nodes, skippedCount: additions.length - nodes.length }
}

function modeLabel(mode: PlaybackMode): string {
  return {
    sequential: '顺序播放',
    'repeat-all': '顺序循环',
    'repeat-one': '单曲循环',
    shuffle: '乱序播放'
  }[mode]
}

export const useAppStore = defineStore('app', () => {
  const defaults = createDefaultAppState()
  const initialized = ref(false)
  const busy = ref(false)
  const page = ref<AppPage>('library')
  const queueSection = ref<QueueSection>('current')
  const queueDrawerOpen = ref(false)
  const library = ref<MusicTreeNode[]>([])
  const queue = ref<MusicTreeNode[]>([])
  const savedQueues = ref<SavedQueue[]>([])
  const queueHistory = ref<QueueHistoryEntry[]>([])
  const shuffle = ref<ShuffleState | null>(null)
  const activeSavedQueueId = ref<NodeId | null>(null)
  const activeHistoryEntryId = ref<NodeId | null>(null)
  const selectedLibraryIds = ref(new Set<NodeId>())
  const selectedQueueIds = ref(new Set<NodeId>())
  const selectedSavedIds = ref(new Set<NodeId>())
  const expandedNodeIds = ref(new Set<NodeId>())
  const unavailablePaths = ref(new Set<string>())
  const currentTrackId = ref<NodeId | null>(null)
  const playbackContext = ref<PlaybackContext | null>(null)
  const positionSeconds = ref(0)
  const volume = ref(defaults.playback.volume)
  const playbackMode = ref<PlaybackMode>(defaults.playback.mode)
  const paused = ref(true)
  const durationSeconds = ref(0)
  const coverDataUrl = ref<string | null>(null)
  const mediaRevision = ref(0)
  const dragPayload = ref<DragPayload | null>(null)
  const message = ref<string | null>(null)
  const modeMessage = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  let saveTimer: number | undefined
  let messageTimer: number | undefined
  let modeMessageTimer: number | undefined
  let playbackRequest = 0

  const activeSavedQueue = computed<SavedQueue | null>(() =>
    savedQueues.value.find((savedQueue) => savedQueue.id === activeSavedQueueId.value) ?? null
  )
  const activeHistoryEntry = computed<QueueHistoryEntry | null>(() =>
    queueHistory.value.find((entry) => entry.id === activeHistoryEntryId.value) ?? null
  )

  const currentTrack = computed<TrackNode | null>(() => {
    if (!currentTrackId.value || !playbackContext.value) {
      return null
    }
    const roots = playbackContext.value.source === 'queue' ? queue.value : library.value
    const node = findNode(roots, currentTrackId.value)
    return node?.type === 'track' ? node : null
  })

  const queueTrackCount = computed(() => flattenTracks(queue.value).length)

  function persistedTrees(): MusicTreeNode[][] {
    return [
      library.value,
      queue.value,
      ...savedQueues.value.map((savedQueue) => savedQueue.nodes),
      ...queueHistory.value.map((entry) => entry.nodes),
      ...(shuffle.value ? [shuffle.value.originalQueue] : [])
    ]
  }

  const unavailableNodeIds = computed(() => {
    const ids = new Set<NodeId>()
    persistedTrees().forEach((nodes) => {
      flattenTracks(nodes).forEach((track) => {
        if (unavailablePaths.value.has(normalizeMusicPathForComparison(track.path))) {
          ids.add(track.id)
        }
      })
    })
    return ids
  })

  function showMessage(text: string): void {
    message.value = text
    if (messageTimer !== undefined) {
      window.clearTimeout(messageTimer)
    }
    messageTimer = window.setTimeout(() => {
      message.value = null
    }, 2600)
  }

  function showModeMessage(mode: PlaybackMode): void {
    modeMessage.value = modeLabel(mode)
    if (modeMessageTimer !== undefined) {
      window.clearTimeout(modeMessageTimer)
    }
    modeMessageTimer = window.setTimeout(() => {
      modeMessage.value = null
    }, 1800)
  }

  function showError(error: unknown, fallback: string): void {
    errorMessage.value = error instanceof Error && error.message ? error.message : fallback
  }

  function acceptsTreeSize(nodes: readonly MusicTreeNode[], label: string): boolean {
    if (isWithinTreeNodeLimit(nodes, MAX_PERSISTED_TREE_NODE_COUNT)) {
      return true
    }
    errorMessage.value = `${label}超过 ${MAX_PERSISTED_TREE_NODE_COUNT} 个节点的安全上限，本次操作未应用。`
    return false
  }

  function snapshot(): PersistedAppState {
    return {
      schemaVersion: APP_STATE_SCHEMA_VERSION,
      library: createTransferableTree(library.value),
      queue: createTransferableTree(queue.value),
      savedQueues: savedQueues.value.map((savedQueue) => ({
        id: savedQueue.id,
        name: savedQueue.name,
        nodes: createTransferableTree(savedQueue.nodes),
        createdAt: savedQueue.createdAt,
        updatedAt: savedQueue.updatedAt
      })),
      queueHistory: queueHistory.value.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        reason: entry.reason,
        nodes: createTransferableTree(entry.nodes)
      })),
      shuffle: shuffle.value
        ? {
            originalQueue: createTransferableTree(shuffle.value.originalQueue),
            originalTrackIdByShuffledTrackId: {
              ...shuffle.value.originalTrackIdByShuffledTrackId
            }
          }
        : null,
      playback: {
        currentTrackId: currentTrackId.value,
        context: playbackContext.value ? { ...playbackContext.value } : null,
        positionSeconds: positionSeconds.value,
        volume: volume.value,
        mode: playbackMode.value,
        paused: paused.value
      },
      expandedNodeIds: [...expandedNodeIds.value]
    }
  }

  async function persistSnapshot(errorFallback: string): Promise<void> {
    try {
      await window.silentNocturne.saveState(snapshot())
    } catch (error) {
      showError(error, errorFallback)
    }
  }

  function scheduleSave(): void {
    if (!initialized.value) {
      return
    }
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer)
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined
      void persistSnapshot('保存应用状态失败。')
    }, 180)
  }

  function scheduleProgressSave(): void {
    if (!initialized.value || saveTimer !== undefined) {
      return
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined
      void persistSnapshot('保存播放进度失败。')
    }, 5000)
  }

  async function flushState(): Promise<void> {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer)
      saveTimer = undefined
    }
    if (initialized.value) {
      await persistSnapshot('关闭前保存应用状态失败。')
    }
  }

  async function refreshAvailability(showFailure = false): Promise<void> {
    const pathsByKey = new Map<string, string>()
    persistedTrees().forEach((nodes) => {
      flattenTracks(nodes).forEach((track) => {
        pathsByKey.set(normalizeMusicPathForComparison(track.path), track.path)
      })
    })
    const paths = [...pathsByKey.values()]
    if (paths.length === 0) {
      unavailablePaths.value = new Set()
      return
    }

    try {
      const unavailable = new Set<string>()
      for (let index = 0; index < paths.length; index += 2000) {
        const results = await window.silentNocturne.checkTracks(paths.slice(index, index + 2000))
        results.forEach((result) => {
          if (!result.available) {
            unavailable.add(normalizeMusicPathForComparison(result.path))
          }
        })
      }
      unavailablePaths.value = unavailable
    } catch (error) {
      if (showFailure) {
        showError(error, '检查本地音乐文件失败。')
      }
    }
  }

  async function initialize(): Promise<void> {
    try {
      const loaded = await window.silentNocturne.loadState()
      library.value = loaded.state.library
      queue.value = loaded.state.queue
      savedQueues.value = loaded.state.savedQueues
      queueHistory.value = loaded.state.queueHistory
      shuffle.value = loaded.state.shuffle
      currentTrackId.value = loaded.state.playback.currentTrackId
      playbackContext.value = loaded.state.playback.context
      positionSeconds.value = loaded.state.playback.positionSeconds
      volume.value = loaded.state.playback.volume
      playbackMode.value = loaded.state.playback.mode
      paused.value = true
      expandedNodeIds.value = new Set(loaded.state.expandedNodeIds)
      activeSavedQueueId.value = savedQueues.value[0]?.id ?? null
      activeHistoryEntryId.value = queueHistory.value.at(-1)?.id ?? null

      if (currentTrackId.value && !currentTrack.value) {
        stopPlayback()
      } else if (currentTrack.value) {
        const restoredTrackId = currentTrack.value.id
        const available = await window.silentNocturne.checkTrack(currentTrack.value.path)
        if (!available && currentTrack.value?.id === restoredTrackId) {
          unavailablePaths.value = new Set([
            ...unavailablePaths.value,
            normalizeMusicPathForComparison(currentTrack.value.path)
          ])
          stopPlayback()
          errorMessage.value = `无法恢复“${currentTrack.value?.name ?? '上次播放的音乐'}”：本地文件已不可用。`
        } else if (currentTrack.value?.id === restoredTrackId) {
          mediaRevision.value += 1
          try {
            const metadata = await window.silentNocturne.getTrackMetadata(currentTrack.value.path)
            if (currentTrack.value?.id === restoredTrackId) {
              durationSeconds.value = metadata.durationSeconds ?? 0
              coverDataUrl.value = metadata.coverDataUrl
            }
          } catch {
            if (currentTrack.value?.id === restoredTrackId) {
              coverDataUrl.value = null
            }
          }
        }
      }
      await refreshAvailability()
      if (loaded.warning) {
        errorMessage.value = loaded.warning
      }
    } catch (error) {
      showError(error, '无法载入应用状态。')
    } finally {
      initialized.value = true
    }
  }

  async function importFolders(): Promise<void> {
    busy.value = true
    try {
      const imported = await window.silentNocturne.chooseMusicFolders()
      if (imported.length === 0) {
        return
      }
      const nextLibrary = [...library.value, ...imported]
      if (!acceptsTreeSize(nextLibrary, '分类歌单')) {
        return
      }
      library.value = nextLibrary
      imported.forEach((node) => expandedNodeIds.value.add(node.id))
      scheduleSave()
      showMessage(`已导入 ${imported.length} 个音乐文件夹。`)
    } catch (error) {
      showError(error, '导入音乐文件夹失败。')
    } finally {
      busy.value = false
    }
  }

  async function importFiles(): Promise<void> {
    busy.value = true
    try {
      const imported = await window.silentNocturne.chooseMusicFiles()
      const filtered = removeDuplicateDirectTracks(library.value, imported, {
        parentId: null,
        index: library.value.length
      })
      const nextLibrary = [...library.value, ...filtered.nodes]
      if (!acceptsTreeSize(nextLibrary, '分类歌单')) {
        return
      }
      library.value = nextLibrary
      scheduleSave()
      showMessage(
        filtered.skippedCount > 0
          ? `已导入 ${filtered.nodes.length} 首，跳过 ${filtered.skippedCount} 首重复音乐。`
          : `已导入 ${filtered.nodes.length} 首音乐。`
      )
    } catch (error) {
      showError(error, '导入音乐失败。')
    } finally {
      busy.value = false
    }
  }

  function rootsFor(source: TreeSource, savedQueueId: NodeId | null = null): MusicTreeNode[] {
    if (source === 'library') {
      return library.value
    }
    if (source === 'queue') {
      return queue.value
    }
    const targetId = savedQueueId ?? activeSavedQueueId.value
    return savedQueues.value.find((savedQueue) => savedQueue.id === targetId)?.nodes ?? []
  }

  function writeRoots(
    source: TreeSource,
    nodes: MusicTreeNode[],
    savedQueueId: NodeId | null = null
  ): void {
    if (source === 'library') {
      library.value = nodes
    } else if (source === 'queue') {
      queue.value = nodes
    } else {
      const targetId = savedQueueId ?? activeSavedQueueId.value
      savedQueues.value = savedQueues.value.map((savedQueue) =>
        savedQueue.id === targetId ? updateSavedQueue(savedQueue, nodes) : savedQueue
      )
    }
  }

  function selectionFor(source: TreeSource): Set<NodeId> {
    if (source === 'library') {
      return selectedLibraryIds.value
    }
    return source === 'queue' ? selectedQueueIds.value : selectedSavedIds.value
  }

  function setSelection(source: TreeSource, selected: Set<NodeId>): void {
    if (source === 'library') {
      selectedLibraryIds.value = selected
    } else if (source === 'queue') {
      selectedQueueIds.value = selected
    } else {
      selectedSavedIds.value = selected
    }
  }

  function toggleSelection(source: TreeSource, nodeId: NodeId): void {
    const roots = rootsFor(source)
    const node = findNode(roots, nodeId)
    if (!node) {
      return
    }
    setSelection(source, toggleNodeSelection(node, selectionFor(source), roots))
  }

  function selectForContextMenu(source: TreeSource, nodeId: NodeId): void {
    const selected = selectionFor(source)
    if (selected.has(nodeId)) {
      return
    }
    const node = findNode(rootsFor(source), nodeId)
    setSelection(source, node ? new Set(collectSubtreeIds(node)) : new Set())
  }

  function toggleExpanded(nodeId: NodeId): void {
    const next = new Set(expandedNodeIds.value)
    if (next.has(nodeId)) {
      next.delete(nodeId)
    } else {
      next.add(nodeId)
    }
    expandedNodeIds.value = next
    scheduleSave()
  }

  async function playTrack(trackId: NodeId, source: PlaybackSource): Promise<void> {
    const request = ++playbackRequest
    const roots = source === 'queue' ? queue.value : library.value
    const node = findNode(roots, trackId)
    if (!node || node.type !== 'track') {
      return
    }

    const available = await window.silentNocturne.checkTrack(node.path)
    if (request !== playbackRequest || findNode(source === 'queue' ? queue.value : library.value, trackId)?.type !== 'track') {
      return
    }
    if (!available) {
      unavailablePaths.value = new Set([
        ...unavailablePaths.value,
        normalizeMusicPathForComparison(node.path)
      ])
      stopPlayback()
      errorMessage.value = `无法播放“${node.name}”：本地文件已不可用。请修复索引或删除该项目。`
      return
    }

    const location = findNodeLocation(roots, node.id)
    currentTrackId.value = node.id
    playbackContext.value = {
      source,
      containerId: source === 'library' ? location?.parentId ?? null : null
    }
    positionSeconds.value = 0
    paused.value = false
    unavailablePaths.value.delete(normalizeMusicPathForComparison(node.path))
    coverDataUrl.value = null
    mediaRevision.value += 1
    try {
      const metadata = await window.silentNocturne.getTrackMetadata(node.path)
      if (request === playbackRequest && currentTrackId.value === node.id) {
        durationSeconds.value = metadata.durationSeconds ?? 0
        coverDataUrl.value = metadata.coverDataUrl
      }
    } catch {
      if (request === playbackRequest && currentTrackId.value === node.id) {
        durationSeconds.value = 0
        coverDataUrl.value = null
      }
    }
    scheduleSave()
  }

  function stopPlayback(): void {
    playbackRequest += 1
    currentTrackId.value = null
    playbackContext.value = null
    positionSeconds.value = 0
    durationSeconds.value = 0
    coverDataUrl.value = null
    paused.value = true
    mediaRevision.value += 1
    scheduleSave()
  }

  function togglePlayback(): void {
    if (!currentTrack.value) {
      const first = flattenTracks(queue.value)[0]
      if (first) {
        void playTrack(first.id, 'queue')
      }
      return
    }
    paused.value = !paused.value
    scheduleSave()
  }

  function playAdjacent(
    direction: -1 | 1,
    cause: PlaybackAdvanceCause = 'user-skip'
  ): void {
    if (!currentTrack.value || !playbackContext.value) {
      return
    }
    const order = getPlaybackOrder(
      library.value,
      queue.value,
      playbackContext.value,
      currentTrack.value.id
    )
    const adjacent = getAdjacentTrack(
      order,
      currentTrack.value.id,
      direction,
      playbackMode.value,
      cause
    )
    if (adjacent) {
      void playTrack(adjacent.id, playbackContext.value.source)
    } else if (direction === 1) {
      stopPlayback()
    }
  }

  function cyclePlaybackMode(): void {
    const nextMode = getNextPlaybackMode(playbackMode.value)
    if (nextMode === 'shuffle') {
      const transition = enterShuffle(queue.value)
      queue.value = transition.queue
      shuffle.value = transition.shuffle
      selectedQueueIds.value = new Set()
    } else if (playbackMode.value === 'shuffle' && shuffle.value) {
      const transition = exitShuffle(
        queue.value,
        shuffle.value,
        queueHistory.value,
        playbackContext.value?.source === 'queue' ? currentTrackId.value : null
      )
      queue.value = transition.queue
      queueHistory.value = transition.history
      shuffle.value = null
      activeHistoryEntryId.value = queueHistory.value.at(-1)?.id ?? activeHistoryEntryId.value
      selectedQueueIds.value = new Set()
      if (playbackContext.value?.source === 'queue') {
        if (transition.currentTrackId) {
          currentTrackId.value = transition.currentTrackId
        } else {
          stopPlayback()
        }
      }
    }
    playbackMode.value = nextMode
    showModeMessage(nextMode)
    scheduleSave()
  }

  function updatePosition(value: number): void {
    positionSeconds.value = Number.isFinite(value) ? Math.max(0, value) : 0
    scheduleProgressSave()
  }

  function updateDuration(value: number): void {
    durationSeconds.value = Number.isFinite(value) ? Math.max(0, value) : 0
  }

  function updateVolume(value: number): void {
    volume.value = Math.max(0, Math.min(1, value))
    scheduleSave()
  }

  async function markPlaybackError(): Promise<void> {
    const failedTrack = currentTrack.value
    if (!failedTrack) {
      stopPlayback()
      return
    }
    const available = await window.silentNocturne.checkTrack(failedTrack.path).catch(() => true)
    if (!available) {
      unavailablePaths.value = new Set([
        ...unavailablePaths.value,
        normalizeMusicPathForComparison(failedTrack.path)
      ])
      errorMessage.value = `“${failedTrack.name}”的本地文件不可用，播放已停止。`
    } else {
      errorMessage.value = `无法读取“${failedTrack.name}”，文件可能损坏或格式不受支持。`
    }
    if (currentTrack.value?.id === failedTrack.id) {
      stopPlayback()
    }
  }

  function deleteSelected(source: TreeSource): void {
    const roots = rootsFor(source)
    const selected = selectionFor(source)
    if (selected.size === 0) {
      return
    }

    const normalized = normalizeSelectedRootIds(roots, selected)
    if (
      currentTrackId.value &&
      playbackContext.value?.source === source &&
      containsAnyNode(roots, normalized, currentTrackId.value)
    ) {
      stopPlayback()
    }

    const result = removeNodes(roots, selected)
    writeRoots(source, result.nodes)
    setSelection(source, new Set())
    scheduleSave()
  }

  function addSelectedLibraryToQueue(destination?: TreeDestination): void {
    const selectedNodes = getSelectedNodes(library.value, selectedLibraryIds.value)
    if (selectedNodes.length === 0) {
      return
    }
    let copies: MusicTreeNode[] = cloneTreeWithNewIds(selectedNodes)
    if (playbackMode.value === 'shuffle') {
      copies = flattenTracks(copies)
    }
    const nextQueue = insertNodes(
      queue.value,
      copies,
      destination ?? { parentId: null, index: queue.value.length }
    )
    if (!acceptsTreeSize(nextQueue, '当前播放队列')) {
      return
    }
    queue.value = nextQueue
    selectedQueueIds.value = new Set(copies.flatMap(collectSubtreeIds))
    scheduleSave()
    showMessage(`已向播放队列加入 ${flattenTracks(copies).length} 首音乐。`)
  }

  function beginDrag(source: TreeSource, nodeId: NodeId): void {
    if (!selectionFor(source).has(nodeId)) {
      const node = findNode(rootsFor(source), nodeId)
      setSelection(source, node ? new Set(collectSubtreeIds(node)) : new Set())
    }
    dragPayload.value = {
      kind: 'nodes',
      source,
      savedQueueId: source === 'saved' ? activeSavedQueueId.value : null,
      nodeIds: normalizeSelectedRootIds(rootsFor(source), selectionFor(source))
    }
  }

  function beginSavedQueueDrag(savedQueueId: NodeId): void {
    dragPayload.value = { kind: 'saved-queue', savedQueueId }
  }

  function endDrag(): void {
    dragPayload.value = null
  }

  function nodesFromDragPayload(payload: DragPayload): MusicTreeNode[] {
    if (payload.kind === 'saved-queue') {
      const savedQueue = savedQueues.value.find((candidate) => candidate.id === payload.savedQueueId)
      if (!savedQueue) {
        return []
      }
      return [
        {
          id: createNodeId(),
          type: 'playlist',
          name: savedQueue.name,
          children: cloneTreeWithNewIds(savedQueue.nodes)
        }
      ]
    }
    return payload.nodeIds
      .map((nodeId) => findNode(rootsFor(payload.source, payload.savedQueueId), nodeId))
      .filter((node): node is MusicTreeNode => node !== undefined)
  }

  function dropIntoTree(
    targetSource: TreeSource,
    destination: TreeDestination,
    targetSavedQueueId: NodeId | null = null
  ): void {
    const payload = dragPayload.value
    if (!payload) {
      return
    }

    try {
      const resolvedTargetSavedQueueId =
        targetSource === 'saved'
          ? targetSavedQueueId ?? activeSavedQueueId.value
          : null
      const targetRoots = rootsFor(targetSource, resolvedTargetSavedQueueId)
      const sameTree =
        payload.kind === 'nodes' &&
        payload.source === targetSource &&
        (targetSource !== 'saved' || payload.savedQueueId === resolvedTargetSavedQueueId)
      let next: MusicTreeNode[]
      if (sameTree && payload.kind === 'nodes') {
        next = moveNodes(targetRoots, new Set(payload.nodeIds), destination)
      } else {
        let additions = cloneTreeWithNewIds(nodesFromDragPayload(payload))
        if (targetSource === 'queue' && playbackMode.value === 'shuffle') {
          additions = flattenTracks(additions)
        }
        if (targetSource === 'library') {
          additions = removeDuplicateDirectTracks(targetRoots, additions, destination).nodes
        }
        next = insertNodes(targetRoots, additions, destination)
      }
      if (!acceptsTreeSize(next, targetSource === 'library' ? '分类歌单' : '播放队列')) {
        return
      }
      writeRoots(targetSource, next, resolvedTargetSavedQueueId)
      scheduleSave()
    } catch (error) {
      showError(error, '无法将项目移动到该位置。')
    } finally {
      endDrag()
    }
  }

  function dropIntoQueue(destination: TreeDestination): void {
    dropIntoTree('queue', destination)
  }

  async function importDroppedMusic(
    files: readonly File[],
    targetSource: TreeSource,
    destination: TreeDestination,
    targetSavedQueueId: NodeId | null = null
  ): Promise<void> {
    if (files.length === 0) {
      return
    }
    busy.value = true
    try {
      const imported = await window.silentNocturne.importDroppedMusic(files)
      const targetRoots = rootsFor(targetSource, targetSavedQueueId)
      let additions = imported.nodes
      let skippedCount = imported.skippedCount
      if (targetSource === 'queue' && playbackMode.value === 'shuffle') {
        additions = flattenTracks(additions)
      }
      if (targetSource === 'library') {
        const filtered = removeDuplicateDirectTracks(targetRoots, additions, destination)
        additions = filtered.nodes
        skippedCount += filtered.skippedCount
      }
      const next = insertNodes(targetRoots, additions, destination)
      if (!acceptsTreeSize(next, targetSource === 'library' ? '分类歌单' : '播放队列')) {
        return
      }
      writeRoots(targetSource, next, targetSavedQueueId)
      scheduleSave()
      showMessage(
        `已导入 ${flattenTracks(additions).length} 首音乐${skippedCount ? `，跳过 ${skippedCount} 项` : ''}。`
      )
    } catch (error) {
      showError(error, '无法导入拖入的文件或文件夹。')
    } finally {
      busy.value = false
    }
  }

  function destinationFor(
    targetId: NodeId,
    position: 'before' | 'inside' | 'after',
    source: TreeSource = 'queue',
    savedQueueId: NodeId | null = null
  ): TreeDestination | null {
    const roots = rootsFor(source, savedQueueId)
    const target = findNode(roots, targetId)
    const location = findNodeLocation(roots, targetId)
    if (!target || !location) {
      return null
    }
    if (position === 'inside') {
      return target.type === 'playlist'
        ? { parentId: target.id, index: target.children.length }
        : { parentId: location.parentId, index: location.index + 1 }
    }
    return {
      parentId: location.parentId,
      index: location.index + (position === 'after' ? 1 : 0)
    }
  }

  function saveCurrentQueue(name: string): void {
    const normalizedName = name.trim()
    if (!normalizedName) {
      errorMessage.value = '请输入已保存队列名称。'
      return
    }
    if (savedQueues.value.length >= MAX_SAVED_QUEUE_COUNT) {
      errorMessage.value = `已保存队列最多保留 ${MAX_SAVED_QUEUE_COUNT} 个。`
      return
    }
    const savedQueue = createSavedQueue(normalizedName, queue.value)
    savedQueues.value = [...savedQueues.value, savedQueue]
    activeSavedQueueId.value = savedQueue.id
    queueSection.value = 'saved'
    scheduleSave()
    showMessage(`已保存队列“${normalizedName}”。`)
  }

  function renameSavedQueue(savedQueueId: NodeId, name: string): void {
    const normalizedName = name.trim()
    if (!normalizedName) {
      return
    }
    savedQueues.value = savedQueues.value.map((savedQueue) =>
      savedQueue.id === savedQueueId
        ? { ...savedQueue, name: normalizedName, updatedAt: Date.now() }
        : savedQueue
    )
    scheduleSave()
  }

  function deleteSavedQueue(savedQueueId: NodeId): void {
    savedQueues.value = savedQueues.value.filter((savedQueue) => savedQueue.id !== savedQueueId)
    if (activeSavedQueueId.value === savedQueueId) {
      activeSavedQueueId.value = savedQueues.value[0]?.id ?? null
      selectedSavedIds.value = new Set()
    }
    scheduleSave()
  }

  function recordCurrentQueue(reason: QueueHistoryEntry['reason'], protectedEntryId?: NodeId): void {
    queueHistory.value = appendQueueHistory(queueHistory.value, queue.value, reason, {
      protectedEntryId
    })
    activeHistoryEntryId.value = queueHistory.value.at(-1)?.id ?? activeHistoryEntryId.value
  }

  async function replaceQueueWithSaved(savedQueueId: NodeId, startPlaying: boolean): Promise<void> {
    const savedQueue = savedQueues.value.find((candidate) => candidate.id === savedQueueId)
    if (!savedQueue) {
      return
    }
    recordCurrentQueue('replace')
    const cloned = cloneTreeWithIdMap(savedQueue.nodes)
    let replacement = cloned.nodes
    if (playbackMode.value === 'shuffle') {
      replacement = flattenTracks(replacement)
    }
    if (playbackContext.value?.source === 'queue') {
      stopPlayback()
    }
    queue.value = replacement
    selectedQueueIds.value = new Set()
    scheduleSave()
    showMessage(`已用“${savedQueue.name}”替换当前队列。`)
    if (startPlaying) {
      const firstOriginalTrack = flattenTracks(savedQueue.nodes)[0]
      const targetTrackId = firstOriginalTrack
        ? cloned.clonedIdByOriginalId[firstOriginalTrack.id]
        : null
      if (targetTrackId) {
        await playTrack(targetTrackId, 'queue')
      }
    }
  }

  async function playSavedNode(savedQueueId: NodeId, nodeId: NodeId): Promise<void> {
    const savedQueue = savedQueues.value.find((candidate) => candidate.id === savedQueueId)
    const node = savedQueue ? findNode(savedQueue.nodes, nodeId) : undefined
    if (!savedQueue || !node) {
      return
    }
    const targetOriginal = node.type === 'track' ? node : flattenTracks([node])[0]
    if (!targetOriginal) {
      return
    }
    recordCurrentQueue('replace')
    const cloned = cloneTreeWithIdMap(savedQueue.nodes)
    let replacement = cloned.nodes
    if (playbackMode.value === 'shuffle') {
      replacement = flattenTracks(replacement)
    }
    if (playbackContext.value?.source === 'queue') {
      stopPlayback()
    }
    queue.value = replacement
    selectedQueueIds.value = new Set()
    scheduleSave()
    await playTrack(cloned.clonedIdByOriginalId[targetOriginal.id], 'queue')
  }

  function insertSavedQueueIntoQueue(
    savedQueueId: NodeId,
    destination: TreeDestination = { parentId: null, index: queue.value.length }
  ): void {
    const savedQueue = savedQueues.value.find((candidate) => candidate.id === savedQueueId)
    if (!savedQueue) {
      return
    }
    const wrapper: PlaylistNode = {
      id: createNodeId(),
      type: 'playlist',
      name: savedQueue.name,
      children: cloneTreeWithNewIds(savedQueue.nodes)
    }
    const additions: MusicTreeNode[] = playbackMode.value === 'shuffle' ? flattenTracks([wrapper]) : [wrapper]
    const next = insertNodes(queue.value, additions, destination)
    if (!acceptsTreeSize(next, '当前播放队列')) {
      return
    }
    queue.value = next
    scheduleSave()
    showMessage(`已插入已保存队列“${savedQueue.name}”。`)
  }

  function clearCurrentQueue(): void {
    if (queue.value.length === 0) {
      return
    }
    recordCurrentQueue('clear')
    if (playbackContext.value?.source === 'queue') {
      stopPlayback()
    }
    queue.value = []
    selectedQueueIds.value = new Set()
    scheduleSave()
    showMessage('已清空当前播放队列，可从历史中恢复。')
  }

  function restoreQueueHistory(entryId: NodeId): void {
    const entry = queueHistory.value.find((candidate) => candidate.id === entryId)
    if (!entry) {
      return
    }
    recordCurrentQueue('restore', entry.id)
    let restored = cloneTreeWithNewIds(entry.nodes)
    if (playbackMode.value === 'shuffle') {
      restored = flattenTracks(restored)
    }
    if (playbackContext.value?.source === 'queue') {
      stopPlayback()
    }
    queue.value = restored
    selectedQueueIds.value = new Set()
    scheduleSave()
    showMessage('已从队列历史恢复。历史记录仍然保留。')
  }

  function saveHistoryAsQueue(entryId: NodeId, name: string): void {
    const entry = queueHistory.value.find((candidate) => candidate.id === entryId)
    const normalizedName = name.trim()
    if (!entry || !normalizedName) {
      return
    }
    if (savedQueues.value.length >= MAX_SAVED_QUEUE_COUNT) {
      errorMessage.value = `已保存队列最多保留 ${MAX_SAVED_QUEUE_COUNT} 个。`
      return
    }
    const savedQueue = createSavedQueue(normalizedName, entry.nodes)
    savedQueues.value = [...savedQueues.value, savedQueue]
    activeSavedQueueId.value = savedQueue.id
    scheduleSave()
    showMessage(`已将历史另存为“${normalizedName}”。`)
  }

  function replaceEverywhere(replacements: readonly TrackPathReplacement[]): void {
    const repairsCurrent =
      currentTrack.value !== null &&
      replacements.some((replacement) =>
        musicPathsEqual(currentTrack.value?.path ?? '', replacement.oldPath)
      )
    library.value = replaceTrackPaths(library.value, replacements)
    queue.value = replaceTrackPaths(queue.value, replacements)
    savedQueues.value = savedQueues.value.map((savedQueue) => ({
      ...savedQueue,
      nodes: replaceTrackPaths(savedQueue.nodes, replacements),
      updatedAt: Date.now()
    }))
    queueHistory.value = queueHistory.value.map((entry) => ({
      ...entry,
      nodes: replaceTrackPaths(entry.nodes, replacements)
    }))
    if (shuffle.value) {
      shuffle.value = {
        ...shuffle.value,
        originalQueue: replaceTrackPaths(shuffle.value.originalQueue, replacements)
      }
    }
    if (repairsCurrent) {
      resetCurrentMediaAfterPathChange()
    }
  }

  function replaceOne(source: TreeSource, trackId: NodeId, newPath: string, newName: string): void {
    writeRoots(source, replaceTrackPathById(rootsFor(source), trackId, newPath, newName))
  }

  function resetCurrentMediaAfterPathChange(): void {
    paused.value = true
    positionSeconds.value = 0
    durationSeconds.value = 0
    coverDataUrl.value = null
    mediaRevision.value += 1
  }

  function countPathOccurrences(path: string): number {
    return persistedTrees().reduce(
      (count, nodes) =>
        count + flattenTracks(nodes).filter((track) => musicPathsEqual(track.path, path)).length,
      0
    )
  }

  async function repairTrack(source: TreeSource, trackId: NodeId): Promise<void> {
    const track = findNode(rootsFor(source), trackId)
    if (!track || track.type !== 'track') {
      return
    }
    try {
      const replacement = await window.silentNocturne.chooseReplacementMusicFile()
      if (!replacement) {
        return
      }
      const replaceAll =
        countPathOccurrences(track.path) > 1 &&
        window.confirm('是否同时修复所有仍使用相同旧路径的项目？')
      if (replaceAll) {
        replaceEverywhere([
          { oldPath: track.path, newPath: replacement.path, newName: replacement.name }
        ])
      } else {
        const repairsCurrent =
          currentTrack.value?.id === track.id && playbackContext.value?.source === source
        replaceOne(source, track.id, replacement.path, replacement.name)
        if (repairsCurrent) {
          resetCurrentMediaAfterPathChange()
        }
      }
      scheduleSave()
      await refreshAvailability()
      showMessage(replaceAll ? '已修复所有相同旧索引。' : '已修复所选音乐索引。')
    } catch (error) {
      showError(error, '修复音乐索引失败。')
    }
  }

  function selectedRepairCandidates(source: TreeSource): FolderMatchCandidate[] {
    const roots = rootsFor(source)
    const selectedRoots = getSelectedNodes(roots, selectionFor(source))
    const candidates: FolderMatchCandidate[] = []
    const visit = (
      node: MusicTreeNode,
      relativeDirectory: readonly string[] | null
    ): void => {
      if (node.type === 'track') {
        if (unavailablePaths.value.has(normalizeMusicPathForComparison(node.path))) {
          candidates.push({
            key: node.id,
            oldPath: node.path,
            fileName: fileNameFromPath(node.path),
            relativeDirectory
          })
        }
        return
      }
      node.children.forEach((child) =>
        visit(
          child,
          child.type === 'playlist'
            ? [...(relativeDirectory ?? []), child.name]
            : relativeDirectory ?? []
        )
      )
    }
    selectedRoots.forEach((node) => visit(node, node.type === 'track' ? null : []))
    return candidates
  }

  async function repairSelectedFromFolder(source: TreeSource): Promise<void> {
    const candidates = selectedRepairCandidates(source)
    if (candidates.length === 0) {
      errorMessage.value = '请先选择标记为文件不可用的音乐或其祖先歌单。'
      return
    }
    busy.value = true
    try {
      const result = await window.silentNocturne.matchMusicInFolder(candidates)
      if (!result) {
        return
      }
      const replaceAll =
        result.replacements.some((replacement) => countPathOccurrences(replacement.oldPath) > 1) &&
        window.confirm('匹配成功的索引中存在重复旧路径，是否同步修复所有相同索引？')
      if (replaceAll) {
        replaceEverywhere(result.replacements)
      } else {
        const repairsCurrent =
          playbackContext.value?.source === source &&
          result.replacements.some((replacement) => replacement.key === currentTrackId.value)
        let roots = rootsFor(source)
        result.replacements.forEach((replacement) => {
          roots = replaceTrackPathById(
            roots,
            replacement.key,
            replacement.newPath,
            fileNameFromPath(replacement.newPath)
          )
        })
        writeRoots(source, roots)
        if (repairsCurrent) {
          resetCurrentMediaAfterPathChange()
        }
      }
      scheduleSave()
      await refreshAvailability()
      showMessage(
        `已修复 ${result.replacements.length} 首；${result.unmatchedKeys.length} 首未匹配，${result.ambiguousKeys.length} 首存在同名歧义。`
      )
    } catch (error) {
      showError(error, '从文件夹匹配音乐失败。')
    } finally {
      busy.value = false
    }
  }

  async function migrateMusicDirectory(): Promise<void> {
    const pathsByKey = new Map<string, string>()
    persistedTrees().forEach((nodes) =>
      flattenTracks(nodes).forEach((track) =>
        pathsByKey.set(normalizeMusicPathForComparison(track.path), track.path)
      )
    )
    busy.value = true
    try {
      const result = await window.silentNocturne.chooseDirectoryMigration([...pathsByKey.values()])
      if (!result) {
        return
      }
      replaceEverywhere(result.replacements)
      scheduleSave()
      await refreshAvailability()
      showMessage(
        `已迁移 ${result.replacements.length} 个索引；${result.unmatchedCount} 个目标文件未找到。`
      )
    } catch (error) {
      showError(error, '迁移音乐目录索引失败。')
    } finally {
      busy.value = false
    }
  }

  function selectSavedQueue(savedQueueId: NodeId): void {
    activeSavedQueueId.value = savedQueueId
    selectedSavedIds.value = new Set()
  }

  function selectHistoryEntry(entryId: NodeId): void {
    activeHistoryEntryId.value = entryId
  }

  function dismissError(): void {
    errorMessage.value = null
  }

  return {
    initialized,
    busy,
    page,
    queueSection,
    queueDrawerOpen,
    library,
    queue,
    savedQueues,
    queueHistory,
    shuffle,
    activeSavedQueueId,
    activeSavedQueue,
    activeHistoryEntryId,
    activeHistoryEntry,
    selectedLibraryIds,
    selectedQueueIds,
    selectedSavedIds,
    expandedNodeIds,
    unavailablePaths,
    unavailableNodeIds,
    currentTrackId,
    currentTrack,
    playbackContext,
    positionSeconds,
    durationSeconds,
    volume,
    playbackMode,
    paused,
    coverDataUrl,
    mediaRevision,
    queueTrackCount,
    dragPayload,
    message,
    modeMessage,
    errorMessage,
    initialize,
    importFolders,
    importFiles,
    refreshAvailability,
    rootsFor,
    toggleSelection,
    selectForContextMenu,
    toggleExpanded,
    playTrack,
    stopPlayback,
    togglePlayback,
    playAdjacent,
    cyclePlaybackMode,
    updatePosition,
    updateDuration,
    updateVolume,
    markPlaybackError,
    deleteSelected,
    addSelectedLibraryToQueue,
    beginDrag,
    beginSavedQueueDrag,
    endDrag,
    dropIntoTree,
    dropIntoQueue,
    importDroppedMusic,
    destinationFor,
    saveCurrentQueue,
    renameSavedQueue,
    deleteSavedQueue,
    replaceQueueWithSaved,
    playSavedNode,
    insertSavedQueueIntoQueue,
    clearCurrentQueue,
    restoreQueueHistory,
    saveHistoryAsQueue,
    repairTrack,
    repairSelectedFromFolder,
    migrateMusicDirectory,
    selectSavedQueue,
    selectHistoryEntry,
    dismissError,
    flushState
  }
})
