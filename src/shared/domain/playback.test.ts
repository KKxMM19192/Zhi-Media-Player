import { describe, expect, it } from 'vitest'
import {
  getAdjacentTrack,
  getLibraryDirectPlaybackOrder,
  getQueuePlaybackOrder
} from './playback'
import type { MusicTreeNode } from './music-tree'

const tree: MusicTreeNode[] = [
  {
    id: 'root',
    type: 'playlist',
    name: 'Root',
    children: [
      { id: 'direct-a', type: 'track', name: 'A.mp3', path: 'A.mp3' },
      {
        id: 'nested',
        type: 'playlist',
        name: 'Nested',
        children: [{ id: 'nested-b', type: 'track', name: 'B.flac', path: 'B.flac' }]
      },
      { id: 'direct-c', type: 'track', name: 'C.mp3', path: 'C.mp3' }
    ]
  }
]

describe('playback order', () => {
  it('plays only direct tracks from a library playlist', () => {
    expect(getLibraryDirectPlaybackOrder(tree, 'direct-a').map((track) => track.id)).toEqual([
      'direct-a',
      'direct-c'
    ])
  })

  it('recursively flattens the playback queue', () => {
    expect(getQueuePlaybackOrder(tree).map((track) => track.id)).toEqual([
      'direct-a',
      'nested-b',
      'direct-c'
    ])
  })

  it('distinguishes repeated paths by node identity', () => {
    const queue: MusicTreeNode[] = [
      { id: 'first', type: 'track', name: 'A.mp3', path: 'same.mp3' },
      { id: 'second', type: 'track', name: 'A.mp3', path: 'same.mp3' }
    ]
    expect(getAdjacentTrack(getQueuePlaybackOrder(queue), 'first', 1, 'sequential')?.id).toBe(
      'second'
    )
  })

  it('stops at the end in sequential mode and wraps in repeat-all mode', () => {
    const order = getQueuePlaybackOrder(tree)
    expect(getAdjacentTrack(order, 'direct-c', 1, 'sequential')).toBeUndefined()
    expect(getAdjacentTrack(order, 'direct-c', 1, 'repeat-all')?.id).toBe('direct-a')
  })
})
