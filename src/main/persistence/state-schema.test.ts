import { describe, expect, it } from 'vitest'
import {
  APP_STATE_SCHEMA_VERSION,
  createDefaultAppState
} from '../../shared/domain/app-state'
import { parsePersistedAppState } from './state-schema'

describe('application state schema', () => {
  it('migrates schema v1 state without discarding the playback loop', () => {
    const legacyState = {
      schemaVersion: 1,
      library: [
        {
          id: 'library-track',
          type: 'track',
          name: 'Library.mp3',
          path: 'C:\\Music\\Library.mp3'
        }
      ],
      queue: [
        {
          id: 'queue-track',
          type: 'track',
          name: 'Queue.flac',
          path: 'C:\\Music\\Queue.flac'
        }
      ],
      playback: {
        currentTrackId: 'queue-track',
        context: { source: 'queue', containerId: null },
        positionSeconds: 12,
        volume: 0.6,
        mode: 'repeat-all',
        paused: false
      },
      expandedNodeIds: []
    }

    expect(parsePersistedAppState(legacyState)).toEqual({
      ...legacyState,
      schemaVersion: APP_STATE_SCHEMA_VERSION,
      savedQueues: [],
      queueHistory: [],
      shuffle: null
    })
  })

  it('requires a matching original queue snapshot while shuffle is active', () => {
    const state = {
      ...createDefaultAppState(),
      playback: {
        ...createDefaultAppState().playback,
        mode: 'shuffle'
      }
    }

    expect(() => parsePersistedAppState(state)).toThrow(/shuffle snapshot/)
  })

  it('accepts shared track identities only between the active shuffle queue and its snapshot', () => {
    const track = {
      id: 'track',
      type: 'track' as const,
      name: 'Track.mp3',
      path: 'C:\\Music\\Track.mp3'
    }
    const state = {
      ...createDefaultAppState(),
      queue: [track],
      shuffle: {
        originalQueue: [
          {
            id: 'playlist',
            type: 'playlist' as const,
            name: 'Playlist',
            children: [{ ...track, id: 'original-track' }]
          }
        ],
        originalTrackIdByShuffledTrackId: {
          track: 'original-track'
        }
      },
      playback: {
        ...createDefaultAppState().playback,
        mode: 'shuffle' as const
      }
    }

    expect(parsePersistedAppState(state)).toEqual(state)
  })
})
