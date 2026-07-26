import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
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
})
