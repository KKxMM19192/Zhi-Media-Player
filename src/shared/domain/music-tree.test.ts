import { describe, expect, it } from 'vitest'
import {
  cloneTreeWithNewIds,
  cloneTree,
  cloneTreeWithIdMap,
  collectSubtreeIds,
  containsAnyNode,
  flattenTracks,
  getSelectionState,
  isWithinTreeNodeLimit,
  moveNodes,
  normalizeSelectedRootIds,
  removeNodes,
  toggleNodeSelection,
  treesHaveSameContent,
  type MusicTreeNode
} from './music-tree'

const tree: MusicTreeNode[] = [
  {
    id: 'playlist-a',
    type: 'playlist',
    name: 'A',
    children: [
      { id: 'track-b', type: 'track', name: 'B.mp3', path: 'C:\\Music\\B.mp3' },
      {
        id: 'playlist-c',
        type: 'playlist',
        name: 'C',
        children: [{ id: 'track-d', type: 'track', name: 'D.flac', path: 'C:\\Music\\D.flac' }]
      }
    ]
  },
  { id: 'track-e', type: 'track', name: 'E.mp3', path: 'C:\\Music\\E.mp3' }
]

function takeIds(values: string[]): () => string {
  return () => values.shift() as string
}

describe('music tree', () => {
  it('clones a tree with completely independent node identities', () => {
    const ids = ['new-a', 'new-b', 'new-c', 'new-d']
    const cloned = cloneTreeWithNewIds([tree[0]], () => ids.shift() as string)

    expect(cloned).toEqual([
      {
        ...tree[0],
        id: 'new-a',
        children: [
          { ...(tree[0] as MusicTreeNode & { children: MusicTreeNode[] }).children[0], id: 'new-b' },
          {
            ...(tree[0] as MusicTreeNode & { children: MusicTreeNode[] }).children[1],
            id: 'new-c',
            children: [
              {
                ...(
                  (tree[0] as MusicTreeNode & { children: MusicTreeNode[] }).children[1] as MusicTreeNode & {
                    children: MusicTreeNode[]
                  }
                ).children[0],
                id: 'new-d'
              }
            ]
          }
        ]
      }
    ])
    expect(new Set(cloned.flatMap(collectSubtreeIds))).not.toContain('playlist-a')
  })

  it('deep-clones a tree while preserving identities and compares semantic content', () => {
    const cloned = cloneTree(tree)

    expect(cloned).toEqual(tree)
    expect(cloned).not.toBe(tree)
    expect((cloned[0] as { children: MusicTreeNode[] }).children).not.toBe(
      (tree[0] as { children: MusicTreeNode[] }).children
    )
    expect(treesHaveSameContent(tree, cloned)).toBe(true)
    expect(
      treesHaveSameContent(tree, [
        {
          ...(cloned[0] as MusicTreeNode),
          name: 'Changed'
        } as MusicTreeNode,
        cloned[1]
      ])
    ).toBe(false)
  })

  it('clones a tree with an explicit identity map', () => {
    const cloned = cloneTreeWithIdMap(
      [tree[0]],
      takeIds(['mapped-playlist', 'mapped-track', 'mapped-child', 'mapped-nested-track'])
    )

    expect(cloned.clonedIdByOriginalId).toEqual({
      'playlist-a': 'mapped-playlist',
      'track-b': 'mapped-track',
      'playlist-c': 'mapped-child',
      'track-d': 'mapped-nested-track'
    })
    expect(flattenTracks(cloned.nodes).map((track) => track.id)).toEqual([
      'mapped-track',
      'mapped-nested-track'
    ])
  })

  it('normalizes selected descendants to the top selected ancestor', () => {
    const selected = new Set(['playlist-a', 'track-b', 'track-d', 'track-e'])
    expect(normalizeSelectedRootIds(tree, selected)).toEqual(['playlist-a', 'track-e'])
  })

  it('selects a whole subtree and reports partial ancestor selection', () => {
    const selected = toggleNodeSelection(
      (tree[0] as MusicTreeNode & { children: MusicTreeNode[] }).children[0],
      new Set()
    )
    expect(getSelectionState(tree[0], selected)).toBe('partial')
    expect(toggleNodeSelection(tree[0], selected)).toEqual(new Set(collectSubtreeIds(tree[0])))
  })

  it('removes selected ancestors when a descendant is deselected', () => {
    const allSelected = new Set(collectSubtreeIds(tree[0]))
    const nestedTrack = (
      (
        tree[0] as MusicTreeNode & {
          children: MusicTreeNode[]
        }
      ).children[1] as MusicTreeNode & { children: MusicTreeNode[] }
    ).children[0]

    const selected = toggleNodeSelection(nestedTrack, allSelected, tree)

    expect(selected.has('playlist-a')).toBe(false)
    expect(selected.has('playlist-c')).toBe(false)
    expect(selected.has('track-b')).toBe(true)
    expect(normalizeSelectedRootIds(tree, selected)).toEqual(['track-b'])
  })

  it('moves multiple roots together and adjusts an in-parent insertion index', () => {
    const moved = moveNodes(tree, new Set(['track-b', 'playlist-c']), {
      parentId: null,
      index: 2
    })
    expect(moved.map((node) => node.id)).toEqual(['playlist-a', 'track-e', 'track-b', 'playlist-c'])
    expect((moved[0] as MusicTreeNode & { children: MusicTreeNode[] }).children).toEqual([])
  })

  it('rejects moving a playlist into one of its descendants', () => {
    expect(() =>
      moveNodes(tree, new Set(['playlist-a']), { parentId: 'playlist-c', index: 0 })
    ).toThrow(/descendants/)
  })

  it('removes only top-level selected ancestors and detects current descendants', () => {
    const removed = removeNodes(tree, new Set(['playlist-a', 'track-d']))
    expect(removed.rootIds).toEqual(['playlist-a'])
    expect(removed.removed).toEqual([tree[0]])
    expect(containsAnyNode(tree, removed.rootIds, 'track-d')).toBe(true)
    expect(flattenTracks(removed.nodes).map((node) => node.id)).toEqual(['track-e'])
  })

  it('checks the complete merged tree against a node budget', () => {
    expect(isWithinTreeNodeLimit(tree, 5)).toBe(true)
    expect(isWithinTreeNodeLimit(tree, 4)).toBe(false)
  })
})
