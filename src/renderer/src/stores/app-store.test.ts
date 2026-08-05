// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultAppState, type PersistedAppState } from '../../../shared/domain/app-state'
import type { FolderMatchResult } from '../../../shared/contracts/app-api'
import type { MusicTreeNode } from '../../../shared/domain/music-tree'
import { useAppStore } from './app-store'

vi.mock('../../../shared/domain/app-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/domain/app-state')>()
  return {
    ...actual,
    MAX_PERSISTED_TOTAL_NODE_COUNT: 101
  }
})

const queue: MusicTreeNode[] = [
  {
    id: 'playlist',
    type: 'playlist',
    name: 'Playlist',
    children: [
      { id: 'current', type: 'track', name: 'Current.mp3', path: 'C:\\Music\\Current.mp3' },
      { id: 'next', type: 'track', name: 'Next.mp3', path: 'C:\\Music\\Next.mp3' }
    ]
  },
  { id: 'last', type: 'track', name: 'Last.flac', path: 'C:\\Music\\Last.flac' }
]

function createTrack(id: string): MusicTreeNode {
  return {
    id,
    type: 'track',
    name: `${id}.mp3`,
    path: `C:\\Music\\${id}.mp3`
  }
}

function createQueue(): MusicTreeNode[] {
  return structuredClone(queue)
}

describe('app store queue editing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(window, 'silentNocturne', {
      configurable: true,
      value: {
        checkTrack: async () => true,
        getTrackMetadata: async () => ({ durationSeconds: null, coverDataUrl: null })
      }
    })
  })

  it('stops and clears playback when deleting the current track ancestor', () => {
    const store = useAppStore()
    store.queue = queue
    store.currentTrackId = 'current'
    store.playbackContext = { source: 'queue', containerId: null }
    store.paused = false
    store.selectedQueueIds = new Set(['playlist', 'current', 'next'])

    store.deleteSelected('queue')

    expect(store.currentTrackId).toBeNull()
    expect(store.playbackContext).toBeNull()
    expect(store.paused).toBe(true)
    expect(store.queue.map((node) => node.id)).toEqual(['last'])
  })

  it('keeps the current node identity while moving its ancestor', () => {
    const store = useAppStore()
    store.queue = queue
    store.currentTrackId = 'current'
    store.playbackContext = { source: 'queue', containerId: null }
    store.selectedQueueIds = new Set(['playlist', 'current', 'next'])

    store.beginDrag('queue', 'playlist')
    store.dropIntoQueue({ parentId: null, index: 2 })

    expect(store.currentTrackId).toBe('current')
    expect(store.currentTrack?.id).toBe('current')
    expect(store.queue.map((node) => node.id)).toEqual(['last', 'playlist'])
  })

  it('ignores an older play request that finishes after a newer selection', async () => {
    let resolveFirstCheck: ((available: boolean) => void) | undefined
    const firstCheck = new Promise<boolean>((resolve) => {
      resolveFirstCheck = resolve
    })
    Object.defineProperty(window, 'silentNocturne', {
      configurable: true,
      value: {
        checkTrack: (path: string) =>
          path.endsWith('Current.mp3') ? firstCheck : Promise.resolve(true),
        getTrackMetadata: async () => ({ durationSeconds: null, coverDataUrl: null })
      }
    })
    const store = useAppStore()
    store.queue = queue

    const olderRequest = store.playTrack('current', 'queue')
    await store.playTrack('next', 'queue')
    resolveFirstCheck?.(true)
    await olderRequest

    expect(store.currentTrackId).toBe('next')
  })

  it('creates an independent snapshot when saving the current queue', () => {
    const store = useAppStore()
    store.queue = createQueue()

    store.saveCurrentQueue('Road trip')

    const savedQueue = store.savedQueues[0]!
    const savedPlaylist = savedQueue.nodes[0]!
    const currentPlaylist = store.queue[0]!
    expect(savedPlaylist).toMatchObject({ type: 'playlist', name: 'Playlist' })
    expect(currentPlaylist).toMatchObject({ type: 'playlist', name: 'Playlist' })
    expect(savedPlaylist).not.toBe(currentPlaylist)
    expect(savedPlaylist.id).not.toBe(currentPlaylist.id)

    if (savedPlaylist.type !== 'playlist' || currentPlaylist.type !== 'playlist') {
      throw new Error('Expected both roots to be playlists.')
    }
    expect(savedPlaylist.children[0]).not.toBe(currentPlaylist.children[0])
    expect(savedPlaylist.children[0]?.id).not.toBe(currentPlaylist.children[0]?.id)

    store.queue[0] = createTrack('replacement')

    expect(savedQueue.nodes[0]).toMatchObject({ type: 'playlist', name: 'Playlist' })
  })

  it('records the previous queue and creates independent nodes when replacing from a saved queue', async () => {
    const store = useAppStore()
    store.queue = createQueue()
    store.saveCurrentQueue('Saved queue')
    const savedQueue = store.savedQueues[0]!
    store.queue = [createTrack('previous')]

    await store.replaceQueueWithSaved(savedQueue.id, false)

    expect(store.queueHistory).toHaveLength(1)
    expect(store.queueHistory[0]).toMatchObject({
      reason: 'replace',
      nodes: [{ type: 'track', path: 'C:\\Music\\previous.mp3' }]
    })
    expect(store.queue[0]).not.toBe(savedQueue.nodes[0])
    expect(store.queue[0]?.id).not.toBe(savedQueue.nodes[0]?.id)

    const replacementPlaylist = store.queue[0]
    const savedPlaylist = savedQueue.nodes[0]
    if (replacementPlaylist?.type !== 'playlist' || savedPlaylist?.type !== 'playlist') {
      throw new Error('Expected the saved queue replacement to preserve its playlist root.')
    }
    expect(replacementPlaylist.children[0]).not.toBe(savedPlaylist.children[0])
    expect(replacementPlaylist.children[0]?.id).not.toBe(savedPlaylist.children[0]?.id)
  })

  it('leaves queue, history, and playback untouched when a replacement exceeds the total node limit', async () => {
    const store = useAppStore()
    store.queue = Array.from({ length: 99 }, (_, index) => createTrack(`current-${index}`))
    store.queueHistory = [
      {
        id: 'existing-history',
        createdAt: 1,
        reason: 'clear',
        nodes: [createTrack('history-track')]
      }
    ]
    store.savedQueues = [
      {
        id: 'saved-queue',
        name: 'Saved queue',
        nodes: [createTrack('saved-track')],
        createdAt: 1,
        updatedAt: 1
      }
    ]
    store.currentTrackId = 'current-0'
    store.playbackContext = { source: 'queue', containerId: null }
    store.paused = false
    const previousQueue = [...store.queue]
    const previousHistory = [...store.queueHistory]

    await store.replaceQueueWithSaved('saved-queue', false)

    expect(store.queue).toEqual(previousQueue)
    expect(store.queueHistory).toEqual(previousHistory)
    expect(store.currentTrackId).toBe('current-0')
    expect(store.playbackContext).toEqual({ source: 'queue', containerId: null })
    expect(store.paused).toBe(false)
    expect(store.errorMessage).toContain('超过 101 个节点')
  })

  it('records clear and restore operations while retaining the restored history entry', () => {
    const store = useAppStore()
    store.queue = [createTrack('before-clear')]

    store.clearCurrentQueue()

    const clearEntry = store.queueHistory[0]!
    expect(clearEntry).toMatchObject({
      reason: 'clear',
      nodes: [{ path: 'C:\\Music\\before-clear.mp3' }]
    })
    expect(store.queue).toEqual([])

    store.restoreQueueHistory(clearEntry.id)

    expect(store.queueHistory).toHaveLength(2)
    expect(store.queueHistory.map((entry) => entry.reason)).toEqual(['clear', 'restore'])
    expect(store.queueHistory.some((entry) => entry.id === clearEntry.id)).toBe(true)
    expect(store.queue[0]?.id).not.toBe(clearEntry.nodes[0]?.id)

    store.queue = [createTrack('current')]
    store.queueHistory = Array.from({ length: 10 }, (_, index) => ({
      id: `history-${index}`,
      createdAt: index,
      reason: 'replace' as const,
      nodes: [createTrack(`history-track-${index}`)]
    }))

    store.restoreQueueHistory('history-0')

    expect(store.queueHistory).toHaveLength(10)
    expect(store.queueHistory.some((entry) => entry.id === 'history-0')).toBe(true)
    expect(store.queueHistory.some((entry) => entry.id === 'history-1')).toBe(false)
    expect(store.queueHistory.at(-1)?.reason).toBe('restore')
  })

  it('shuffles once on entry, then restores the original tree and current track mapping on exit', () => {
    const store = useAppStore()
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    store.queue = createQueue()
    store.currentTrackId = 'current'
    store.playbackContext = { source: 'queue', containerId: null }
    store.expandedNodeIds = new Set(['playlist'])
    const mediaRevision = store.mediaRevision

    store.cyclePlaybackMode()
    store.cyclePlaybackMode()
    store.cyclePlaybackMode()

    expect(store.playbackMode).toBe('shuffle')
    expect(random).toHaveBeenCalledTimes(2)
    expect(store.queue.every((node) => node.type === 'track')).toBe(true)
    expect(store.expandedNodeIds.has('playlist')).toBe(false)
    const shuffledCurrentTrackId = store.currentTrackId
    const restoredCurrentTrackId = store.shuffle?.originalTrackIdByShuffledTrackId[shuffledCurrentTrackId!]
    expect(restoredCurrentTrackId).toBeDefined()

    store.cyclePlaybackMode()

    expect(store.playbackMode).toBe('sequential')
    expect(random).toHaveBeenCalledTimes(2)
    expect(store.shuffle).toBeNull()
    expect(store.queue).toMatchObject([
      {
        type: 'playlist',
        name: 'Playlist',
        children: [
          { type: 'track', path: 'C:\\Music\\Current.mp3' },
          { type: 'track', path: 'C:\\Music\\Next.mp3' }
        ]
      },
      { type: 'track', path: 'C:\\Music\\Last.flac' }
    ])
    expect(store.queueHistory.at(-1)).toMatchObject({ reason: 'shuffle-exit' })
    expect(store.currentTrackId).toBe(restoredCurrentTrackId)
    expect(store.currentTrack?.path).toBe('C:\\Music\\Current.mp3')
    expect(store.expandedNodeIds.has(store.queue[0]!.id)).toBe(true)
    expect(store.mediaRevision).toBe(mediaRevision)

    random.mockRestore()
  })

  it('persists a structured-cloneable schema v2 snapshot with queue state', async () => {
    let savedState: PersistedAppState | undefined
    Object.defineProperty(window, 'silentNocturne', {
      configurable: true,
      value: {
        loadState: async () => ({ state: createDefaultAppState(), warning: null }),
        saveState: async (state: PersistedAppState) => {
          savedState = structuredClone(state)
        }
      }
    })
    const store = useAppStore()
    await store.initialize()
    store.library = createQueue()
    store.queue = createQueue()
    store.saveCurrentQueue('Snapshot queue')
    await store.replaceQueueWithSaved(store.savedQueues[0]!.id, false)
    store.cyclePlaybackMode()
    store.cyclePlaybackMode()
    store.cyclePlaybackMode()

    await store.flushState()

    expect(savedState?.library).toEqual(queue)
    expect(savedState).toMatchObject({
      schemaVersion: 2,
      savedQueues: [{ name: 'Snapshot queue' }],
      queueHistory: [{ reason: 'replace' }],
      shuffle: expect.any(Object)
    })
    expect(savedState?.shuffle?.originalQueue[0]).toMatchObject({
      type: 'playlist',
      name: 'Playlist'
    })
    expect(() => structuredClone(savedState)).not.toThrow()
  })

  it('applies an asynchronous folder repair to the saved queue that started it', async () => {
    let resolveMatch: (result: FolderMatchResult | null) => void = () => undefined
    const matchResult = new Promise<FolderMatchResult | null>((resolve) => {
      resolveMatch = resolve
    })
    Object.defineProperty(window, 'silentNocturne', {
      configurable: true,
      value: {
        matchMusicInFolder: () => matchResult,
        checkTracks: async (paths: readonly string[]) =>
          paths.map((path) => ({ path, available: true }))
      }
    })
    const store = useAppStore()
    store.savedQueues = [
      {
        id: 'saved-a',
        name: 'Queue A',
        nodes: [createTrack('track-a')],
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'saved-b',
        name: 'Queue B',
        nodes: [createTrack('track-b')],
        createdAt: 2,
        updatedAt: 2
      }
    ]
    store.selectSavedQueue('saved-a')
    store.selectedSavedIds = new Set(['track-a'])
    store.unavailablePaths = new Set(['c:\\music\\track-a.mp3'])

    const repair = store.repairSelectedFromFolder('saved')
    store.selectSavedQueue('saved-b')
    resolveMatch({
      replacements: [
        {
          key: 'track-a',
          oldPath: 'C:\\Music\\track-a.mp3',
          newPath: 'D:\\Recovered\\track-a.mp3'
        }
      ],
      unmatchedKeys: [],
      ambiguousKeys: []
    })
    await repair

    expect(store.activeSavedQueueId).toBe('saved-b')
    expect(store.savedQueues[0]?.nodes[0]).toMatchObject({
      id: 'track-a',
      path: 'D:\\Recovered\\track-a.mp3'
    })
    expect(store.savedQueues[1]?.nodes[0]).toMatchObject({
      id: 'track-b',
      path: 'C:\\Music\\track-b.mp3'
    })
  })
})
