import { describe, expect, it } from 'vitest'
import type { MusicTreeNode } from './music-tree'
import {
  musicPathsEqual,
  replaceTrackPathById,
  replaceTrackPaths
} from './music-path'

const tree: MusicTreeNode[] = [
  {
    id: 'playlist',
    type: 'playlist',
    name: 'Playlist',
    children: [
      { id: 'first', type: 'track', name: 'Old.mp3', path: 'C:\\Music\\Old.mp3' },
      { id: 'second', type: 'track', name: 'Old.mp3', path: 'c:/music/old.mp3' }
    ]
  }
]

describe('music index paths', () => {
  it('compares Windows paths by separator and case', () => {
    expect(musicPathsEqual('C:\\Music\\Track.mp3', 'c:/music/track.mp3')).toBe(true)
  })

  it('replaces every equal old index while retaining node identities and structure', () => {
    const replaced = replaceTrackPaths(tree, [
      { oldPath: 'C:\\MUSIC\\OLD.mp3', newPath: 'D:\\New\\Replacement.flac' }
    ])
    const children = (replaced[0] as { children: MusicTreeNode[] }).children

    expect(children).toEqual([
      { id: 'first', type: 'track', name: 'Replacement.flac', path: 'D:\\New\\Replacement.flac' },
      { id: 'second', type: 'track', name: 'Replacement.flac', path: 'D:\\New\\Replacement.flac' }
    ])
  })

  it('can repair only one repeated occurrence by node identity', () => {
    const replaced = replaceTrackPathById(tree, 'second', 'D:\\New\\Only.mp3')
    const children = (replaced[0] as { children: MusicTreeNode[] }).children

    expect((children[0] as { path: string }).path).toBe('C:\\Music\\Old.mp3')
    expect((children[1] as { path: string }).path).toBe('D:\\New\\Only.mp3')
  })
})
