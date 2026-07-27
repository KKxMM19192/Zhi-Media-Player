<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { FolderPlus, Library, ListMusic, Plus, RefreshCw, Route, Trash2, Wrench } from '@lucide/vue'
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
  initialized,
  busy,
  library,
  selectedLibraryIds,
  expandedNodeIds,
  unavailableNodeIds,
  dragPayload
} = storeToRefs(store)

function destinationFor(targetId: NodeId, position: 'before' | 'inside' | 'after'): TreeDestination | null {
  return store.destinationFor(targetId, position, 'library')
}

function dropNode(targetId: NodeId, position: 'before' | 'inside' | 'after'): void {
  const destination = destinationFor(targetId, position)
  if (destination) {
    store.dropIntoTree('library', destination)
  }
}

function dropExternalNode(files: File[], targetId: NodeId, position: 'before' | 'inside' | 'after'): void {
  const destination = destinationFor(targetId, position)
  if (destination) {
    void store.importDroppedMusic(files, 'library', destination)
  }
}

function dropRoot(event: DragEvent): void {
  event.preventDefault()
  const destination = { parentId: null, index: library.value.length }
  if (event.dataTransfer?.files.length) {
    void store.importDroppedMusic([...event.dataTransfer.files], 'library', destination)
  } else {
    store.dropIntoTree('library', destination)
  }
}

function handleRootDragOver(event: DragEvent): void {
  applyTreeDropEffect(event, 'library')
}
</script>

<template>
  <section class="workspace">
    <div class="workspace-heading">
      <div>
        <p class="eyebrow">LOCAL COLLECTION</p>
        <h1>分类歌单</h1>
        <p>组织本地索引；删除、移动和修复都不会改动磁盘上的音乐文件。</p>
      </div>
      <div class="toolbar">
        <button type="button" :disabled="busy" @click="store.importFolders">
          <FolderPlus :size="18" />
          导入文件夹
        </button>
        <button type="button" :disabled="busy" @click="store.importFiles">
          <Plus :size="18" />
          添加音乐
        </button>
        <button
          type="button"
          :disabled="selectedLibraryIds.size === 0"
          @click="store.addSelectedLibraryToQueue()"
        >
          <ListMusic :size="18" />
          加入队列
        </button>
        <button
          type="button"
          :disabled="busy || selectedLibraryIds.size === 0"
          @click="store.repairSelectedFromFolder('library')"
        >
          <Wrench :size="18" />
          文件夹匹配
        </button>
        <button type="button" :disabled="busy" @click="store.refreshAvailability(true)">
          <RefreshCw :size="18" />
          检查索引
        </button>
        <button type="button" :disabled="busy" @click="store.migrateMusicDirectory">
          <Route :size="18" />
          目录迁移
        </button>
        <button
          class="danger-button"
          type="button"
          :disabled="selectedLibraryIds.size === 0"
          @click="store.deleteSelected('library')"
        >
          <Trash2 :size="18" />
          删除索引
        </button>
      </div>
    </div>

    <div class="tree-panel" @dragover="handleRootDragOver" @drop="dropRoot">
      <div v-if="!initialized" class="empty-state">
        <Library :size="34" />
        <p>正在载入应用状态…</p>
      </div>
      <div v-else-if="library.length === 0" class="empty-state">
        <Library :size="40" />
        <h2>导入第一份本地音乐</h2>
        <p>可选择包含 MP3 或 FLAC 的文件夹，也可把系统文件或文件夹直接拖到此处。</p>
        <button type="button" @click="store.importFolders">
          <FolderPlus :size="18" />
          导入音乐文件夹
        </button>
      </div>
      <MusicTree
        v-else
        :nodes="library"
        source="library"
        :selected-ids="selectedLibraryIds"
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
        @drop-level="(parentId, index) => store.dropIntoTree('library', { parentId, index })"
        @drop-external-node="dropExternalNode"
        @drop-external-level="(files, parentId, index) => store.importDroppedMusic(files, 'library', { parentId, index })"
      />
    </div>
  </section>
</template>
