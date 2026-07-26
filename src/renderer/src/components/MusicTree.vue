<script setup lang="ts">
import { ref } from 'vue'
import { AlertTriangle, ChevronDown, ChevronRight, ListMusic, Music } from '@lucide/vue'
import {
  getSelectionState,
  type MusicTreeNode,
  type NodeId
} from '../../../shared/domain/music-tree'
import type { PlaybackSource } from '../../../shared/domain/playback'

defineOptions({ name: 'MusicTree' })

const props = withDefaults(
  defineProps<{
    nodes: readonly MusicTreeNode[]
    source: PlaybackSource
    selectedIds: ReadonlySet<NodeId>
    expandedIds: ReadonlySet<NodeId>
    unavailableIds: ReadonlySet<NodeId>
    parentId?: NodeId | null
    compact?: boolean
  }>(),
  {
    parentId: null,
    compact: false
  }
)

const emit = defineEmits<{
  toggleSelection: [source: PlaybackSource, nodeId: NodeId]
  toggleExpanded: [nodeId: NodeId]
  activate: [source: PlaybackSource, nodeId: NodeId]
  openContext: [event: MouseEvent, source: PlaybackSource, nodeId: NodeId]
  beginDrag: [source: PlaybackSource, nodeId: NodeId]
  endDrag: []
  dropNode: [targetId: NodeId, position: 'before' | 'inside' | 'after']
  dropLevel: [parentId: NodeId | null, index: number]
}>()

const activeDrop = ref<{ nodeId: NodeId; position: 'before' | 'inside' | 'after' } | null>(
  null
)

function handleDragStart(event: DragEvent, nodeId: NodeId): void {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = props.source === 'queue' ? 'move' : 'copy'
    event.dataTransfer.setData('application/x-silent-nocturne-tree', 'selection')
  }
  emit('beginDrag', props.source, nodeId)
}

function getDropPosition(
  event: DragEvent,
  node: MusicTreeNode
): 'before' | 'inside' | 'after' {
  const target = event.currentTarget as HTMLElement
  const ratio = (event.clientY - target.getBoundingClientRect().top) / target.offsetHeight
  if (node.type === 'playlist' && ratio >= 0.28 && ratio <= 0.72) {
    return 'inside'
  }
  return ratio < 0.5 ? 'before' : 'after'
}

function handleDragOver(event: DragEvent, node: MusicTreeNode): void {
  event.preventDefault()
  activeDrop.value = { nodeId: node.id, position: getDropPosition(event, node) }
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = props.source === 'queue' ? 'move' : 'copy'
  }
}

function handleDrop(event: DragEvent, node: MusicTreeNode): void {
  event.preventDefault()
  const position = getDropPosition(event, node)
  activeDrop.value = null
  emit('dropNode', node.id, position)
}
</script>

<template>
  <ul class="music-tree" :class="{ 'music-tree--compact': compact }" role="tree">
    <li v-for="node in nodes" :key="node.id" class="tree-node" role="treeitem">
      <div
        class="tree-row"
        :class="{
          'tree-row--selected': selectedIds.has(node.id),
          'tree-row--unavailable': unavailableIds.has(node.id),
          [`tree-row--drop-${activeDrop?.position}`]: activeDrop?.nodeId === node.id
        }"
        draggable="true"
        @click="emit('toggleSelection', source, node.id)"
        @dblclick.stop="emit('activate', source, node.id)"
        @contextmenu.prevent="emit('openContext', $event, source, node.id)"
        @dragstart="handleDragStart($event, node.id)"
        @dragend="emit('endDrag')"
        @dragover.stop="handleDragOver($event, node)"
        @dragleave.self="activeDrop = null"
        @drop.stop="handleDrop($event, node)"
      >
        <button
          v-if="node.type === 'playlist'"
          class="tree-expand"
          type="button"
          :aria-label="expandedIds.has(node.id) ? '折叠歌单' : '展开歌单'"
          @click.stop="emit('toggleExpanded', node.id)"
        >
          <ChevronDown v-if="expandedIds.has(node.id)" :size="16" />
          <ChevronRight v-else :size="16" />
        </button>
        <span v-else class="tree-expand tree-expand--spacer" />

        <input
          class="tree-checkbox"
          type="checkbox"
          :checked="getSelectionState(node, selectedIds) === 'all'"
          :indeterminate="getSelectionState(node, selectedIds) === 'partial'"
          :aria-label="`选择 ${node.name}`"
          @click.stop="emit('toggleSelection', source, node.id)"
        />

        <ListMusic v-if="node.type === 'playlist'" class="tree-icon" :size="18" />
        <Music v-else class="tree-icon" :size="18" />
        <span class="tree-name" :title="node.type === 'track' ? node.path : node.name">
          {{ node.name }}
        </span>
        <AlertTriangle
          v-if="node.type === 'track' && unavailableIds.has(node.id)"
          class="tree-warning"
          :size="17"
          aria-label="文件不可用"
        />
      </div>

      <MusicTree
        v-if="node.type === 'playlist' && expandedIds.has(node.id)"
        :nodes="node.children"
        :source="source"
        :selected-ids="selectedIds"
        :expanded-ids="expandedIds"
        :unavailable-ids="unavailableIds"
        :parent-id="node.id"
        :compact="compact"
        @toggle-selection="
          (childSource, childId) => emit('toggleSelection', childSource, childId)
        "
        @toggle-expanded="emit('toggleExpanded', $event)"
        @activate="(childSource, childId) => emit('activate', childSource, childId)"
        @open-context="
          (event, childSource, childId) => emit('openContext', event, childSource, childId)
        "
        @begin-drag="(childSource, childId) => emit('beginDrag', childSource, childId)"
        @end-drag="emit('endDrag')"
        @drop-node="(targetId, position) => emit('dropNode', targetId, position)"
        @drop-level="
          (parentId, index) => emit('dropLevel', parentId, index)
        "
      />
    </li>
    <li
      v-if="source === 'queue'"
      class="tree-root-drop"
      @dragover.prevent
      @drop.prevent.stop="emit('dropLevel', parentId, nodes.length)"
    >
      放到此级末尾
    </li>
  </ul>
</template>
