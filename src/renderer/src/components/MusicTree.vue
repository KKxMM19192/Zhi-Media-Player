<script setup lang="ts">
import { ref } from 'vue'
import { AlertTriangle, ChevronDown, ChevronRight, ListMusic, Music } from '@lucide/vue'
import {
  getSelectionState,
  type MusicTreeNode,
  type NodeId
} from '../../../shared/domain/music-tree'
import {
  applyTreeDropEffect,
  isExternalFileDrag,
  TREE_DRAG_TYPE_PREFIX
} from '../drag-drop'
import type { TreeSource } from '../stores/app-store'

defineOptions({ name: 'MusicTree' })

const props = withDefaults(
  defineProps<{
    nodes: readonly MusicTreeNode[]
    source: TreeSource
    selectedIds: ReadonlySet<NodeId>
    expandedIds: ReadonlySet<NodeId>
    unavailableIds: ReadonlySet<NodeId>
    currentTrackId?: NodeId | null
    parentId?: NodeId | null
    compact?: boolean
    dragActive?: boolean
    readonly?: boolean
    allowDrop?: boolean
  }>(),
  {
    currentTrackId: null,
    parentId: null,
    compact: false,
    dragActive: false,
    readonly: false,
    allowDrop: true
  }
)

const emit = defineEmits<{
  toggleSelection: [source: TreeSource, nodeId: NodeId]
  toggleExpanded: [nodeId: NodeId]
  activate: [source: TreeSource, nodeId: NodeId]
  openContext: [event: MouseEvent, source: TreeSource, nodeId: NodeId]
  beginDrag: [source: TreeSource, nodeId: NodeId]
  endDrag: []
  dropNode: [targetId: NodeId, position: 'before' | 'inside' | 'after']
  dropLevel: [parentId: NodeId | null, index: number]
  dropExternalNode: [files: File[], targetId: NodeId, position: 'before' | 'inside' | 'after']
  dropExternalLevel: [files: File[], parentId: NodeId | null, index: number]
}>()

const activeDrop = ref<{ nodeId: NodeId; position: 'before' | 'inside' | 'after' } | null>(
  null
)
const externalDragActive = ref(false)

function handleDragStart(event: DragEvent, nodeId: NodeId): void {
  if (props.readonly) {
    event.preventDefault()
    return
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData(`${TREE_DRAG_TYPE_PREFIX}${props.source}`, 'selection')
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
  if (props.readonly || !props.allowDrop) {
    return
  }
  applyTreeDropEffect(event, props.source)
  externalDragActive.value = isExternalFileDrag(event)
  activeDrop.value = { nodeId: node.id, position: getDropPosition(event, node) }
}

function handleDrop(event: DragEvent, node: MusicTreeNode): void {
  if (props.readonly || !props.allowDrop) {
    return
  }
  event.preventDefault()
  const position = getDropPosition(event, node)
  activeDrop.value = null
  externalDragActive.value = false
  if (isExternalFileDrag(event)) {
    emit('dropExternalNode', [...(event.dataTransfer?.files ?? [])], node.id, position)
  } else {
    emit('dropNode', node.id, position)
  }
}

function handleLevelDragOver(event: DragEvent): void {
  if (props.readonly || !props.allowDrop) {
    return
  }
  applyTreeDropEffect(event, props.source)
  externalDragActive.value = isExternalFileDrag(event)
}

function handleLevelDrop(event: DragEvent): void {
  if (props.readonly || !props.allowDrop) {
    return
  }
  event.preventDefault()
  externalDragActive.value = false
  if (isExternalFileDrag(event)) {
    emit('dropExternalLevel', [...(event.dataTransfer?.files ?? [])], props.parentId, props.nodes.length)
  } else {
    emit('dropLevel', props.parentId, props.nodes.length)
  }
}
</script>

<template>
  <ul
    class="music-tree"
    :class="{
      'music-tree--compact': compact,
      'music-tree--dragging': dragActive || externalDragActive,
      'music-tree--readonly': readonly
    }"
    role="tree"
    @dragover="externalDragActive = isExternalFileDrag($event)"
    @dragleave.self="externalDragActive = false"
  >
    <li v-for="node in nodes" :key="node.id" class="tree-node" role="treeitem">
      <div
        class="tree-row"
        :class="{
          'tree-row--selected': !readonly && selectedIds.has(node.id),
          'tree-row--current': currentTrackId === node.id,
          'tree-row--unavailable': unavailableIds.has(node.id),
          [`tree-row--drop-${activeDrop?.position}`]: activeDrop?.nodeId === node.id
        }"
        :aria-current="currentTrackId === node.id ? 'true' : undefined"
        :draggable="!readonly"
        @click="!readonly && emit('toggleSelection', source, node.id)"
        @dblclick.stop="!readonly && emit('activate', source, node.id)"
        @contextmenu.prevent="!readonly && emit('openContext', $event, source, node.id)"
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
          v-if="!readonly"
          class="tree-checkbox"
          type="checkbox"
          :checked="getSelectionState(node, selectedIds) === 'all'"
          :indeterminate="getSelectionState(node, selectedIds) === 'partial'"
          :aria-label="`选择 ${node.name}`"
          @click.stop="emit('toggleSelection', source, node.id)"
        />
        <span v-else class="tree-checkbox-spacer" />

        <ListMusic v-if="node.type === 'playlist'" class="tree-icon" :size="18" />
        <Music v-else class="tree-icon" :size="18" />
        <span class="tree-name" :title="node.type === 'track' ? node.path : node.name">
          {{ node.name }}
        </span>
        <span
          v-if="
            node.type === 'track' &&
            (unavailableIds.has(node.id) || currentTrackId === node.id)
          "
          class="tree-indicators"
        >
          <AlertTriangle
            v-if="unavailableIds.has(node.id)"
            class="tree-warning"
            :size="17"
            aria-label="文件不可用"
          />
          <span
            v-if="currentTrackId === node.id"
            class="tree-current-badge"
            aria-label="当前音乐"
          >
            当前
          </span>
        </span>
      </div>

      <MusicTree
        v-if="node.type === 'playlist' && expandedIds.has(node.id)"
        :nodes="node.children"
        :source="source"
        :selected-ids="selectedIds"
        :expanded-ids="expandedIds"
        :unavailable-ids="unavailableIds"
        :current-track-id="currentTrackId"
        :parent-id="node.id"
        :compact="compact"
        :drag-active="dragActive"
        :readonly="readonly"
        :allow-drop="allowDrop"
        @toggle-selection="(childSource, childId) => emit('toggleSelection', childSource, childId)"
        @toggle-expanded="emit('toggleExpanded', $event)"
        @activate="(childSource, childId) => emit('activate', childSource, childId)"
        @open-context="(event, childSource, childId) => emit('openContext', event, childSource, childId)"
        @begin-drag="(childSource, childId) => emit('beginDrag', childSource, childId)"
        @end-drag="emit('endDrag')"
        @drop-node="(targetId, position) => emit('dropNode', targetId, position)"
        @drop-level="(parentId, index) => emit('dropLevel', parentId, index)"
        @drop-external-node="(files, targetId, position) => emit('dropExternalNode', files, targetId, position)"
        @drop-external-level="(files, parentId, index) => emit('dropExternalLevel', files, parentId, index)"
      />
    </li>
    <li
      v-if="allowDrop && !readonly"
      class="tree-root-drop"
      @dragover="handleLevelDragOver"
      @drop.prevent.stop="handleLevelDrop"
    >
      放到此级末尾
    </li>
  </ul>
</template>
