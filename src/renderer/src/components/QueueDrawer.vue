<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { X } from '@lucide/vue'
import type { NodeId, TreeDestination } from '../../../shared/domain/music-tree'
import { applyTreeDropEffect } from '../drag-drop'
import type { TreeSource } from '../stores/app-store'
import { useAppStore } from '../stores/app-store'
import MusicTree from './MusicTree.vue'

const emit = defineEmits<{
  activate: [source: TreeSource, nodeId: NodeId]
  openContext: [event: MouseEvent, source: TreeSource, nodeId: NodeId]
}>()

const store = useAppStore()
const {
  queueDrawerOpen,
  queue,
  selectedQueueIds,
  expandedNodeIds,
  unavailableNodeIds,
  queueTrackCount,
  dragPayload
} = storeToRefs(store)

function destinationFor(targetId: NodeId, position: 'before' | 'inside' | 'after'): TreeDestination | null {
  return store.destinationFor(targetId, position)
}

function dropNode(targetId: NodeId, position: 'before' | 'inside' | 'after'): void {
  const destination = destinationFor(targetId, position)
  if (destination) {
    store.dropIntoQueue(destination)
  }
}

function dropExternalNode(files: File[], targetId: NodeId, position: 'before' | 'inside' | 'after'): void {
  const destination = destinationFor(targetId, position)
  if (destination) {
    void store.importDroppedMusic(files, 'queue', destination)
  }
}

function dropRoot(event: DragEvent): void {
  event.preventDefault()
  const destination = { parentId: null, index: queue.value.length }
  if (event.dataTransfer?.files.length) {
    void store.importDroppedMusic([...event.dataTransfer.files], 'queue', destination)
  } else {
    store.dropIntoQueue(destination)
  }
}

function handleRootDragOver(event: DragEvent): void {
  applyTreeDropEffect(event, 'queue')
}
</script>

<template>
  <aside class="queue-drawer" :class="{ open: queueDrawerOpen }" aria-label="当前播放队列">
    <div class="drawer-header">
      <div>
        <span>当前播放队列</span>
        <small>{{ queueTrackCount }} 首音乐</small>
      </div>
      <button class="icon-button" type="button" aria-label="关闭" @click="queueDrawerOpen = false">
        <X :size="19" />
      </button>
    </div>
    <div class="drawer-body" @dragover="handleRootDragOver">
      <div v-if="queue.length === 0" class="drawer-empty" @drop.stop="dropRoot">
        从左侧或系统资源管理器拖入音乐
      </div>
      <MusicTree
        v-else
        compact
        :nodes="queue"
        source="queue"
        :selected-ids="selectedQueueIds"
        :expanded-ids="expandedNodeIds"
        :unavailable-ids="unavailableNodeIds"
        :drag-active="Boolean(dragPayload)"
        @toggle-selection="store.toggleSelection"
        @toggle-expanded="store.toggleExpanded"
        @activate="(source, nodeId) => emit('activate', source, nodeId)"
        @open-context="(event, source, nodeId) => emit('openContext', event, source, nodeId)"
        @begin-drag="store.beginDrag"
        @end-drag="store.endDrag"
        @drop-node="dropNode"
        @drop-level="(parentId, index) => store.dropIntoQueue({ parentId, index })"
        @drop-external-node="dropExternalNode"
        @drop-external-level="(files, parentId, index) => store.importDroppedMusic(files, 'queue', { parentId, index })"
      />
      <div
        class="drawer-root-drop"
        :class="{ 'drop-target--visible': dragPayload }"
        @dragover.prevent
        @drop.stop="dropRoot"
      >
        拖到这里追加
      </div>
    </div>
  </aside>
</template>
