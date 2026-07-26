import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  APP_STATE_SCHEMA_VERSION,
  MAX_PERSISTED_TREE_NODE_COUNT,
  createDefaultAppState,
  type PersistedAppState
} from '../../../shared/domain/app-state'
import {
  cloneTreeWithNewIds,
  collectSubtreeIds,
  containsAnyNode,
  findNode,
  findNodeLocation,
  flattenTracks,
  isWithinTreeNodeLimit,
  insertNodes,
  moveNodes,
  normalizeSelectedRootIds,
  removeNodes,
  toggleNodeSelection,
  type MusicTreeNode,
  type NodeId,
  type TrackNode,
  type TreeDestination
} from '../../../shared/domain/music-tree'
import {
  getAdjacentTrack,
  getPlaybackOrder,
  type PlaybackContext,
  type PlaybackMode,
  type PlaybackSource
} from '../../../shared/domain/playback'

export type AppPage = 'library' | 'queue'

export interface DragPayload {
  readonly source: PlaybackSource
  readonly nodeIds: NodeId[]
}

function getSelectedNodes(
  nodes: readonly MusicTreeNode[],
  selectedIds: ReadonlySet<NodeId>
): MusicTreeNode[] {
  return normalizeSelectedRootIds(nodes, selectedIds)
    .map((nodeId) => findNode(nodes, nodeId))
    .filter((node): node is MusicTreeNode => node !== undefined)
}

function isSamePath(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value.replaceAll('/', '\\').replace(/[\\]+$/, '').toLocaleLowerCase('en-US')
  return normalize(left) === normalize(right)
}

export const useAppStore = defineStore('app', () => {
  const defaults = createDefaultAppState()
  const initialized = ref(false)
  const busy = ref(false)
  const page = ref<AppPage>('library')
  const queueDrawerOpen = ref(false)
  const library = ref<MusicTreeNode[]>([])
  const queue = ref<MusicTreeNode[]>([])
  const selectedLibraryIds = ref(new Set<NodeId>())
  const selectedQueueIds = ref(new Set<NodeId>())
  const expandedNodeIds = ref(new Set<NodeId>())
  const unavailableNodeIds = ref(new Set<NodeId>())
  const currentTrackId = ref<NodeId | null>(null)
  const playbackContext = ref<PlaybackContext | null>(null)
  const positionSeconds = ref(0)
  const volume = ref(defaults.playback.volume)
  const playbackMode = ref<PlaybackMode>(defaults.playback.mode)
  const paused = ref(true)
  const durationSeconds = ref(0)
  const coverDataUrl = ref<string | null>(null)
  const dragPayload = ref<DragPayload | null>(null)
  const message = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  let saveTimer: number | undefined
  let messageTimer: number | undefined
  let playbackRequest = 0

  const currentTrack = computed<TrackNode | null>(() => {
    if (!currentTrackId.value || !playbackContext.value) {
      return null
    }
    const roots = playbackContext.value.source === 'queue' ? queue.value : library.value
    const node = findNode(roots, currentTrackId.value)
    return node?.type === 'track' ? node : null
  })

  const queueTrackCount = computed(() => flattenTracks(queue.value).length)

  function showMessage(text: string): void {
    message.value = text
    if (messageTimer !== undefined) {
      window.clearTimeout(messageTimer)
    }
    messageTimer = window.setTimeout(() => {
      message.value = null
    }, 2600)
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
      library: library.value,
      queue: queue.value,
      playback: {
        currentTrackId: currentTrackId.value,
        context: playbackContext.value,
        positionSeconds: positionSeconds.value,
        volume: volume.value,
        mode: playbackMode.value,
        paused: paused.value
      },
      expandedNodeIds: [...expandedNodeIds.value]
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
      void window.silentNocturne
        .saveState(snapshot())
        .catch((error: unknown) => showError(error, '保存应用状态失败。'))
    }, 180)
  }

  function scheduleProgressSave(): void {
    if (!initialized.value || saveTimer !== undefined) {
      return
    }
    saveTimer = window.setTimeout(() => {
      saveTimer = undefined
      void window.silentNocturne
        .saveState(snapshot())
        .catch((error: unknown) => showError(error, '保存播放进度失败。'))
    }, 5000)
  }

  async function flushState(): Promise<void> {
    if (saveTimer !== undefined) {
      window.clearTimeout(saveTimer)
      saveTimer = undefined
    }
    if (initialized.value) {
      await window.silentNocturne.saveState(snapshot())
    }
  }

  async function initialize(): Promise<void> {
    try {
      const loaded = await window.silentNocturne.loadState()
      library.value = loaded.state.library
      queue.value = loaded.state.queue
      currentTrackId.value = loaded.state.playback.currentTrackId
      playbackContext.value = loaded.state.playback.context
      positionSeconds.value = loaded.state.playback.positionSeconds
      volume.value = loaded.state.playback.volume
      playbackMode.value = loaded.state.playback.mode
      paused.value = true
      expandedNodeIds.value = new Set(loaded.state.expandedNodeIds)

      if (currentTrackId.value && !currentTrack.value) {
        stopPlayback()
      } else if (currentTrack.value) {
        const restoredTrackId = currentTrack.value.id
        const available = await window.silentNocturne.checkTrack(currentTrack.value.path)
        if (!available && currentTrack.value?.id === restoredTrackId) {
          unavailableNodeIds.value = new Set([...unavailableNodeIds.value, restoredTrackId])
          stopPlayback()
          errorMessage.value = `无法恢复“${currentTrack.value?.name ?? '上次播放的音乐'}”：本地文件已不可用。`
        } else if (currentTrack.value?.id === restoredTrackId) {
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
      const directPaths = library.value
        .filter((node): node is TrackNode => node.type === 'track')
        .map((track) => track.path)
      const additions = imported.filter(
        (track) => !directPaths.some((path) => isSamePath(path, track.path))
      )
      const nextLibrary = [...library.value, ...additions]
      if (!acceptsTreeSize(nextLibrary, '分类歌单')) {
        return
      }
      library.value = nextLibrary
      scheduleSave()
      const skipped = imported.length - additions.length
      showMessage(
        skipped > 0
          ? `已导入 ${additions.length} 首，跳过 ${skipped} 首重复音乐。`
          : `已导入 ${additions.length} 首音乐。`
      )
    } catch (error) {
      showError(error, '导入音乐失败。')
    } finally {
      busy.value = false
    }
  }

  function selectionFor(source: PlaybackSource): Set<NodeId> {
    return source === 'queue' ? selectedQueueIds.value : selectedLibraryIds.value
  }

  function rootsFor(source: PlaybackSource): MusicTreeNode[] {
    return source === 'queue' ? queue.value : library.value
  }

  function setSelection(source: PlaybackSource, selected: Set<NodeId>): void {
    if (source === 'queue') {
      selectedQueueIds.value = selected
    } else {
      selectedLibraryIds.value = selected
    }
  }

  function toggleSelection(source: PlaybackSource, nodeId: NodeId): void {
    const node = findNode(rootsFor(source), nodeId)
    if (!node) {
      return
    }
    setSelection(source, toggleNodeSelection(node, selectionFor(source), rootsFor(source)))
  }

  function selectForContextMenu(source: PlaybackSource, nodeId: NodeId): void {
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
    const node = findNode(rootsFor(source), trackId)
    if (!node || node.type !== 'track') {
      return
    }

    const available = await window.silentNocturne.checkTrack(node.path)
    if (
      request !== playbackRequest ||
      findNode(rootsFor(source), trackId)?.type !== 'track'
    ) {
      return
    }
    if (!available) {
      unavailableNodeIds.value = new Set([...unavailableNodeIds.value, node.id])
      stopPlayback()
      errorMessage.value = `无法播放“${node.name}”：本地文件已不可用。`
      return
    }

    const location = findNodeLocation(rootsFor(source), node.id)
    currentTrackId.value = node.id
    playbackContext.value = {
      source,
      containerId: source === 'library' ? location?.parentId ?? null : null
    }
    positionSeconds.value = 0
    paused.value = false
    unavailableNodeIds.value.delete(node.id)
    coverDataUrl.value = null
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

  function playAdjacent(direction: -1 | 1): void {
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
      playbackMode.value
    )
    if (adjacent) {
      void playTrack(adjacent.id, playbackContext.value.source)
    } else if (direction === 1) {
      stopPlayback()
    }
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

  function markPlaybackError(): void {
    if (currentTrack.value) {
      unavailableNodeIds.value = new Set([...unavailableNodeIds.value, currentTrack.value.id])
      errorMessage.value = `无法读取“${currentTrack.value.name}”，播放已停止。`
    }
    stopPlayback()
  }

  function deleteSelected(source: PlaybackSource): void {
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
    if (source === 'queue') {
      queue.value = result.nodes
    } else {
      library.value = result.nodes
    }
    setSelection(source, new Set())
    scheduleSave()
  }

  function addSelectedLibraryToQueue(destination?: TreeDestination): void {
    const selectedNodes = getSelectedNodes(library.value, selectedLibraryIds.value)
    if (selectedNodes.length === 0) {
      return
    }
    const copies = cloneTreeWithNewIds(selectedNodes)
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

  function beginDrag(source: PlaybackSource, nodeId: NodeId): void {
    if (!selectionFor(source).has(nodeId)) {
      const node = findNode(rootsFor(source), nodeId)
      setSelection(source, node ? new Set(collectSubtreeIds(node)) : new Set())
    }
    dragPayload.value = {
      source,
      nodeIds: normalizeSelectedRootIds(rootsFor(source), selectionFor(source))
    }
  }

  function endDrag(): void {
    dragPayload.value = null
  }

  function dropIntoQueue(destination: TreeDestination): void {
    const payload = dragPayload.value
    if (!payload) {
      return
    }

    try {
      if (payload.source === 'library') {
        const sourceNodes = payload.nodeIds
          .map((nodeId) => findNode(library.value, nodeId))
          .filter((node): node is MusicTreeNode => node !== undefined)
        const nextQueue = insertNodes(
          queue.value,
          cloneTreeWithNewIds(sourceNodes),
          destination
        )
        if (!acceptsTreeSize(nextQueue, '当前播放队列')) {
          return
        }
        queue.value = nextQueue
      } else {
        queue.value = moveNodes(queue.value, new Set(payload.nodeIds), destination)
      }
      scheduleSave()
    } catch (error) {
      showError(error, '无法将项目移动到该位置。')
    } finally {
      endDrag()
    }
  }

  function destinationFor(
    targetId: NodeId,
    position: 'before' | 'inside' | 'after'
  ): TreeDestination | null {
    const target = findNode(queue.value, targetId)
    const location = findNodeLocation(queue.value, targetId)
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

  function dismissError(): void {
    errorMessage.value = null
  }

  return {
    initialized,
    busy,
    page,
    queueDrawerOpen,
    library,
    queue,
    selectedLibraryIds,
    selectedQueueIds,
    expandedNodeIds,
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
    queueTrackCount,
    dragPayload,
    message,
    errorMessage,
    initialize,
    importFolders,
    importFiles,
    toggleSelection,
    selectForContextMenu,
    toggleExpanded,
    playTrack,
    stopPlayback,
    togglePlayback,
    playAdjacent,
    updatePosition,
    updateDuration,
    updateVolume,
    markPlaybackError,
    deleteSelected,
    addSelectedLibraryToQueue,
    beginDrag,
    endDrag,
    dropIntoQueue,
    destinationFor,
    dismissError,
    flushState
  }
})
