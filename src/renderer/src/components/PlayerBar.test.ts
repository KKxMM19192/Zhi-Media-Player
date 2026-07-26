// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MusicTreeNode } from '../../../shared/domain/music-tree'
import PlayerBar from './PlayerBar.vue'
import { useAppStore } from '../stores/app-store'

const library: MusicTreeNode[] = [
  {
    id: 'playlist',
    type: 'playlist',
    name: 'Playlist',
    children: [
      {
        id: 'current',
        type: 'track',
        name: 'Current.mp3',
        path: 'C:\\Music\\Current.mp3'
      }
    ]
  }
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PlayerBar restart recovery', () => {
  it('keeps the restored position until metadata is ready and then seeks to it', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    const pinia = createPinia()
    setActivePinia(pinia)
    Object.defineProperty(window, 'silentNocturne', {
      configurable: true,
      value: {
        getMediaUrl: async () => 'sn-media://audio/test-token'
      }
    })
    const store = useAppStore()
    const wrapper = mount(PlayerBar, { global: { plugins: [pinia] } })
    store.library = library
    store.currentTrackId = 'current'
    store.playbackContext = { source: 'library', containerId: 'playlist' }
    store.positionSeconds = 42
    store.paused = true

    await flushPromises()
    const audioWrapper = wrapper.get('audio')
    const audio = audioWrapper.element as HTMLAudioElement
    audio.currentTime = 0

    await audioWrapper.trigger('timeupdate')
    expect(store.positionSeconds).toBe(42)

    Object.defineProperty(audio, 'duration', { configurable: true, value: 120 })
    await audioWrapper.trigger('loadedmetadata')

    expect(audio.currentTime).toBe(42)
    expect(store.positionSeconds).toBe(42)
  })

  it('clamps a restored position that exceeds the current media duration', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    const pinia = createPinia()
    setActivePinia(pinia)
    Object.defineProperty(window, 'silentNocturne', {
      configurable: true,
      value: {
        getMediaUrl: async () => 'sn-media://audio/test-token'
      }
    })
    const store = useAppStore()
    const wrapper = mount(PlayerBar, { global: { plugins: [pinia] } })
    store.library = library
    store.currentTrackId = 'current'
    store.playbackContext = { source: 'library', containerId: 'playlist' }
    store.positionSeconds = 142
    store.paused = true

    await flushPromises()
    const audioWrapper = wrapper.get('audio')
    const audio = audioWrapper.element as HTMLAudioElement
    Object.defineProperty(audio, 'duration', { configurable: true, value: 120 })
    await audioWrapper.trigger('loadedmetadata')

    expect(audio.currentTime).toBe(120)
    expect(store.positionSeconds).toBe(120)
  })
})
