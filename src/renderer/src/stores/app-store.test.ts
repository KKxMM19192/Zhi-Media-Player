// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultAppState, type PersistedAppState } from '../../../shared/domain/app-state'
import type { MusicTreeNode } from '../../../shared/domain/music-tree'
import { useAppStore } from './app-store'

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

  it('converts reactive state to a structured-cloneable persistence snapshot', async () => {
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
    store.library = queue
    store.currentTrackId = 'current'
    store.playbackContext = { source: 'library', containerId: 'playlist' }
    store.positionSeconds = 27

    await store.flushState()

    expect(savedState?.library).toEqual(queue)
    expect(savedState?.playback).toMatchObject({
      currentTrackId: 'current',
      positionSeconds: 27
    })
  })
})
