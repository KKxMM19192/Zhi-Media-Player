import { describe, expect, it } from 'vitest'
import {
  isSupportedMusicPath,
  mapWindowsPathBetweenRoots,
  normalizeWindowsPathForComparison,
  pathsEqual,
  uniqueWindowsPaths
} from './path-utils'

describe('Windows music paths', () => {
  it('recognizes FLAC and MP3 case-insensitively', () => {
    expect(isSupportedMusicPath('C:\\Music\\track.FLAC')).toBe(true)
    expect(isSupportedMusicPath('C:\\Music\\track.mp3')).toBe(true)
    expect(isSupportedMusicPath('C:\\Music\\cover.png')).toBe(false)
  })

  it('normalizes separators, case and trailing separators for comparison', () => {
    expect(normalizeWindowsPathForComparison(' C:/Music/Album/ ')).toBe('c:\\music\\album')
    expect(pathsEqual('C:\\Music\\TRACK.mp3', 'c:/music/track.mp3')).toBe(true)
  })

  it('deduplicates Windows paths while retaining the first spelling', () => {
    expect(uniqueWindowsPaths(['C:\\Music\\A.mp3', 'c:/music/a.mp3', 'D:\\B.flac'])).toEqual([
      'C:\\Music\\A.mp3',
      'D:\\B.flac'
    ])
  })

  it('maps only path-segment descendants between directory roots', () => {
    expect(
      mapWindowsPathBetweenRoots(
        'C:\\Music\\Album\\Track.mp3',
        'C:\\Music',
        'D:\\Archive'
      )
    ).toBe('D:\\Archive\\Album\\Track.mp3')
    expect(
      mapWindowsPathBetweenRoots(
        'C:\\Music-old\\Track.mp3',
        'C:\\Music',
        'D:\\Archive'
      )
    ).toBeNull()
  })
})
