// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { MusicTreeNode } from '../../../shared/domain/music-tree'
import MusicTree from './MusicTree.vue'

const track: MusicTreeNode = {
  id: 'track-1',
  type: 'track',
  name: 'Track 1.mp3',
  path: 'C:\\Music\\Track 1.mp3'
}

function createDragEvent(
  type: 'dragover' | 'drop',
  files: File[],
  types: string[] = [],
  transferOverrides: Partial<DataTransfer> = {}
): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperties(event, {
    clientY: { configurable: true, value: 10 },
    dataTransfer: {
      configurable: true,
      value: Object.assign(transferOverrides, { files, types }) as unknown as DataTransfer
    }
  })
  return event
}

describe('MusicTree', () => {
  it('does not render selection or drag affordances for a readonly history tree', async () => {
    const wrapper = mount(MusicTree, {
      props: {
        nodes: [track],
        source: 'queue',
        selectedIds: new Set([track.id]),
        expandedIds: new Set<string>(),
        unavailableIds: new Set<string>(),
        readonly: true
      }
    })
    const row = wrapper.get('.tree-row')
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true })

    expect(wrapper.find('.tree-checkbox').exists()).toBe(false)
    expect(row.attributes('draggable')).toBe('false')

    await row.trigger('click')
    row.element.dispatchEvent(dragStart)

    expect(dragStart.defaultPrevented).toBe(true)
    expect(wrapper.emitted('toggleSelection')).toBeUndefined()
    expect(wrapper.emitted('beginDrag')).toBeUndefined()
  })

  it('emits the editable tree source and node ID for click, double-click, and context menu actions', async () => {
    const wrapper = mount(MusicTree, {
      props: {
        nodes: [track],
        source: 'saved',
        selectedIds: new Set<string>(),
        expandedIds: new Set<string>(),
        unavailableIds: new Set<string>()
      }
    })
    const row = wrapper.get('.tree-row')

    await row.trigger('click')
    await row.trigger('dblclick')
    await row.trigger('contextmenu')

    expect(wrapper.emitted('toggleSelection')).toEqual([['saved', 'track-1']])
    expect(wrapper.emitted('activate')).toEqual([['saved', 'track-1']])
    expect(wrapper.emitted('openContext')?.[0]?.slice(1)).toEqual(['saved', 'track-1'])
  })

  it('marks the current node by ID when tracks have the same display name', () => {
    const wrapper = mount(MusicTree, {
      props: {
        nodes: [
          track,
          {
            ...track,
            id: 'track-2',
            path: 'D:\\Music\\Track 1.mp3'
          }
        ],
        source: 'queue',
        selectedIds: new Set<string>(),
        expandedIds: new Set<string>(),
        unavailableIds: new Set<string>(),
        currentTrackId: 'track-2'
      }
    })

    const currentRows = wrapper.findAll('.tree-row--current')
    expect(currentRows).toHaveLength(1)
    expect(currentRows[0]?.get('.tree-name').text()).toBe('Track 1.mp3')
    expect(currentRows[0]?.get('.tree-current-badge').text()).toBe('当前')
    expect(currentRows[0]?.attributes('aria-current')).toBe('true')
    expect(wrapper.findAll('.tree-current-badge')).toHaveLength(1)
  })

  it('emits distinct node drop events for external files and internal drags', () => {
    const wrapper = mount(MusicTree, {
      props: {
        nodes: [track],
        source: 'queue',
        selectedIds: new Set<string>(),
        expandedIds: new Set<string>(),
        unavailableIds: new Set<string>()
      }
    })
    const row = wrapper.get('.tree-row')
    Object.defineProperties(row.element, {
      getBoundingClientRect: { configurable: true, value: () => ({ top: 0 }) },
      offsetHeight: { configurable: true, value: 100 }
    })
    const file = new File(['audio data'], 'Track 2.mp3', { type: 'audio/mpeg' })

    row.element.dispatchEvent(createDragEvent('drop', [file]))
    row.element.dispatchEvent(createDragEvent('drop', []))

    expect(wrapper.emitted('dropExternalNode')).toEqual([[[file], 'track-1', 'before']])
    expect(wrapper.emitted('dropNode')).toEqual([['track-1', 'before']])
  })

  it('shows external drop affordances when dragover exposes only the Files type', async () => {
    const wrapper = mount(MusicTree, {
      props: {
        nodes: [track],
        source: 'queue',
        selectedIds: new Set<string>(),
        expandedIds: new Set<string>(),
        unavailableIds: new Set<string>()
      }
    })
    const row = wrapper.get('.tree-row')
    Object.defineProperties(row.element, {
      getBoundingClientRect: { configurable: true, value: () => ({ top: 0 }) },
      offsetHeight: { configurable: true, value: 100 }
    })

    row.element.dispatchEvent(createDragEvent('dragover', [], ['Files']))
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.music-tree').classes()).toContain('music-tree--dragging')
    expect(row.classes()).toContain('tree-row--drop-before')
  })

  it('uses copy for cross-tree drags and move for same-tree drags at rows and level ends', () => {
    const wrapper = mount(MusicTree, {
      props: {
        nodes: [track],
        source: 'queue',
        selectedIds: new Set<string>(),
        expandedIds: new Set<string>(),
        unavailableIds: new Set<string>()
      }
    })
    const row = wrapper.get('.tree-row')
    Object.defineProperties(row.element, {
      getBoundingClientRect: { configurable: true, value: () => ({ top: 0 }) },
      offsetHeight: { configurable: true, value: 100 }
    })
    const transfer = {
      dropEffect: 'none' as DataTransfer['dropEffect'],
      effectAllowed: 'copyMove' as DataTransfer['effectAllowed']
    }

    row.element.dispatchEvent(
      createDragEvent(
        'dragover',
        [],
        ['application/x-silent-nocturne-tree-library'],
        transfer
      )
    )
    expect(transfer.dropEffect).toBe('copy')

    row.element.dispatchEvent(
      createDragEvent(
        'dragover',
        [],
        ['application/x-silent-nocturne-tree-queue'],
        transfer
      )
    )
    expect(transfer.dropEffect).toBe('move')

    const levelEnd = wrapper.get('.tree-root-drop')
    levelEnd.element.dispatchEvent(
      createDragEvent(
        'dragover',
        [],
        ['application/x-silent-nocturne-tree-library'],
        transfer
      )
    )
    expect(transfer.dropEffect).toBe('copy')

    levelEnd.element.dispatchEvent(
      createDragEvent(
        'dragover',
        [],
        ['application/x-silent-nocturne-tree-queue'],
        transfer
      )
    )
    expect(transfer.dropEffect).toBe('move')
  })
})
