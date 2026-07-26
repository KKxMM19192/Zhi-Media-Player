import { describe, expect, it } from 'vitest'
import type { MusicTreeNode } from './music-tree'
import {
  appendQueueHistory,
  createSavedQueue,
  enterShuffle,
  exitShuffle
} from './queue-state'

const queue: MusicTreeNode[] = [
  {
    id: 'playlist',
    type: 'playlist',
    name: 'Playlist',
    children: [
      { id: 'first', type: 'track', name: 'First.mp3', path: 'C:\\Music\\First.mp3' },
      { id: 'second', type: 'track', name: 'Second.mp3', path: 'C:\\Music\\Second.mp3' }
    ]
  },
  { id: 'third', type: 'track', name: 'Third.flac', path: 'C:\\Music\\Third.flac' }
]

function ids(values: string[]): () => string {
  return () => values.shift() as string
}

describe('saved queues and queue history', () => {
  it('creates an independent saved snapshot', () => {
    const saved = createSavedQueue('Evening', queue, {
      idFactory: ids(['saved', 'copy-playlist', 'copy-first', 'copy-second', 'copy-third']),
      now: () => 100
    })

    expect(saved.id).toBe('saved')
    expect(saved.nodes).toEqual([
      {
        ...queue[0],
        id: 'copy-playlist',
        children: [
          { ...(queue[0] as { children: MusicTreeNode[] }).children[0], id: 'copy-first' },
          { ...(queue[0] as { children: MusicTreeNode[] }).children[1], id: 'copy-second' }
        ]
      },
      { ...queue[1], id: 'copy-third' }
    ])
    expect(saved.createdAt).toBe(100)
  })

  it('deduplicates consecutive equal content and keeps the newest entries within the limit', () => {
    const first = appendQueueHistory([], queue, 'replace', {
      idFactory: ids(['history-1', 'h1-playlist', 'h1-first', 'h1-second', 'h1-third']),
      now: () => 1
    })
    const duplicate = appendQueueHistory(first, queue, 'clear')
    const changedQueue = queue.slice(1)
    const second = appendQueueHistory(duplicate, changedQueue, 'clear', {
      idFactory: ids(['history-2', 'h2-third']),
      now: () => 2,
      limit: 1
    })

    expect(duplicate).toEqual(first)
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({ id: 'history-2', reason: 'clear', createdAt: 2 })
  })

  it('can protect a restored history entry while trimming the same transaction', () => {
    const history = [
      { id: 'restore-me', createdAt: 1, reason: 'replace' as const, nodes: queue },
      { id: 'newer', createdAt: 2, reason: 'clear' as const, nodes: queue.slice(1) }
    ]
    const next = appendQueueHistory(history, [], 'restore', {
      idFactory: ids(['current']),
      now: () => 3,
      limit: 2,
      protectedEntryId: 'restore-me'
    })

    expect(next.map((entry) => entry.id)).toEqual(['restore-me', 'current'])
  })
})

describe('shuffle state', () => {
  it('shuffles once into the displayed flat queue and retains the original tree snapshot', () => {
    const randomValues = [0, 0]
    const entered = enterShuffle(queue, {
      random: () => randomValues.shift() ?? 0,
      idFactory: ids(['original-playlist', 'original-first', 'original-second', 'original-third'])
    })

    expect(entered.queue.map((track) => track.id)).toEqual(['second', 'third', 'first'])
    expect(entered.queue.every((node) => node.type === 'track')).toBe(true)
    expect(entered.shuffle.originalQueue.map((node) => node.id)).toEqual([
      'original-playlist',
      'original-third'
    ])
    expect(entered.shuffle.originalTrackIdByShuffledTrackId).toEqual({
      first: 'original-first',
      second: 'original-second',
      third: 'original-third'
    })
  })

  it('records the complete shuffled queue and restores the original current node by identity', () => {
    const entered = enterShuffle(queue, {
      random: () => 0,
      idFactory: ids(['original-playlist', 'original-first', 'original-second', 'original-third'])
    })
    const edited = [
      entered.queue[1],
      {
        id: 'shuffle-only',
        type: 'track' as const,
        name: 'Only.mp3',
        path: 'C:\\Music\\Only.mp3'
      },
      entered.queue[0]
    ]
    const exited = exitShuffle(edited, entered.shuffle, [], 'second', {
      idFactory: ids(['history', 'history-third', 'history-only', 'history-second']),
      now: () => 5
    })

    expect(exited.queue.map((node) => node.id)).toEqual(['original-playlist', 'original-third'])
    expect(exited.currentTrackId).toBe('original-second')
    expect(exited.history[0].nodes.map((node) => node.name)).toEqual([
      'Third.flac',
      'Only.mp3',
      'Second.mp3'
    ])
  })

  it('clears a current track that exists only in the shuffled queue', () => {
    const entered = enterShuffle(queue, {
      random: () => 0,
      idFactory: ids(['original-playlist', 'original-first', 'original-second', 'original-third'])
    })
    const exited = exitShuffle(
      [
        ...entered.queue,
        {
          id: 'shuffle-only',
          type: 'track',
          name: 'Only.mp3',
          path: 'C:\\Music\\Only.mp3'
        }
      ],
      entered.shuffle,
      [],
      'shuffle-only'
    )

    expect(exited.currentTrackId).toBeNull()
  })
})
