<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  Library,
  ListMusic,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Route,
  Settings
} from '@lucide/vue'
import { findNode, flattenTracks, type NodeId } from '../../shared/domain/music-tree'
import LibraryWorkspace from './components/LibraryWorkspace.vue'
import PlayerBar from './components/PlayerBar.vue'
import QueueDrawer from './components/QueueDrawer.vue'
import QueueWorkspace from './components/QueueWorkspace.vue'
import { useAppStore, type TreeSource } from './stores/app-store'

const store = useAppStore()
const {
  page,
  queueDrawerOpen,
  queue,
  activeSavedQueue,
  expandedNodeIds,
  queueTrackCount,
  message,
  modeMessage,
  errorMessage
} = storeToRefs(store)
const settingsOpen = ref(false)
const contextMenu = reactive<{
  open: boolean
  x: number
  y: number
  source: TreeSource
  nodeId: NodeId | null
}>({
  open: false,
  x: 0,
  y: 0,
  source: 'library',
  nodeId: null
})

const contextNode = computed(() =>
  contextMenu.nodeId
    ? findNode(store.rootsFor(contextMenu.source), contextMenu.nodeId)
    : undefined
)

function activate(source: TreeSource, nodeId: NodeId): void {
  store.selectForContextMenu(source, nodeId)
  const node = findNode(store.rootsFor(source), nodeId)
  if (!node) {
    return
  }
  if (node.type === 'playlist') {
    if (!expandedNodeIds.value.has(node.id)) {
      store.toggleExpanded(node.id)
    }
  } else if (source === 'saved') {
    if (activeSavedQueue.value) {
      void store.playSavedNode(activeSavedQueue.value.id, node.id)
    }
  } else {
    void store.playTrack(node.id, source)
  }
}

function openContextMenu(event: MouseEvent, source: TreeSource, nodeId: NodeId): void {
  store.selectForContextMenu(source, nodeId)
  contextMenu.open = true
  contextMenu.x = Math.min(event.clientX, window.innerWidth - 220)
  contextMenu.y = Math.min(event.clientY, window.innerHeight - 280)
  contextMenu.source = source
  contextMenu.nodeId = nodeId
  settingsOpen.value = false
}

function closeMenus(): void {
  contextMenu.open = false
  settingsOpen.value = false
}

function contextPlay(): void {
  const node = contextNode.value
  const source = contextMenu.source
  if (!node) {
    return
  }
  if (source === 'saved') {
    if (activeSavedQueue.value) {
      void store.playSavedNode(activeSavedQueue.value.id, node.id)
    }
  } else {
    const firstTrack = node.type === 'track'
      ? node
      : source === 'library'
        ? node.children.find((child) => child.type === 'track')
        : flattenTracks([node])[0]
    if (firstTrack) {
      void store.playTrack(firstTrack.id, source)
    }
  }
  closeMenus()
}

function contextAddToQueue(): void {
  if (contextMenu.source === 'library') {
    store.addSelectedLibraryToQueue()
  } else if (contextMenu.source === 'saved' && contextMenu.nodeId) {
    store.beginDrag('saved', contextMenu.nodeId)
    store.dropIntoQueue({ parentId: null, index: queue.value.length })
  }
  queueDrawerOpen.value = true
  closeMenus()
}

function contextRepair(): void {
  if (contextMenu.nodeId) {
    void store.repairTrack(contextMenu.source, contextMenu.nodeId)
  }
  closeMenus()
}

function contextFolderRepair(): void {
  void store.repairSelectedFromFolder(contextMenu.source)
  closeMenus()
}

function contextDelete(): void {
  store.deleteSelected(contextMenu.source)
  closeMenus()
}

onMounted(() => {
  void store.initialize()
  window.silentNocturne.onPrepareClose(() => {
    void store.flushState().finally(() => window.silentNocturne.completeClose())
  })
})
</script>

<template>
  <div class="app-shell" @click="closeMenus" @dragover.prevent @drop.prevent>
    <header class="app-header">
      <div class="brand-zone">
        <button
          class="icon-button"
          type="button"
          aria-label="设置与索引维护"
          @click.stop="settingsOpen = !settingsOpen"
        >
          <Settings :size="19" />
        </button>
        <div class="app-brand">
          <Music2 :size="20" aria-hidden="true" />
          <span>Silent Nocturne</span>
        </div>
      </div>

      <nav class="primary-nav" aria-label="主要页面">
        <button type="button" :class="{ active: page === 'library' }" @click="page = 'library'">
          <Library :size="18" />
          分类歌单
        </button>
        <button type="button" :class="{ active: page === 'queue' }" @click="page = 'queue'">
          <ListMusic :size="18" />
          播放队列
          <span class="count-badge">{{ queueTrackCount }}</span>
        </button>
      </nav>

      <div class="header-actions">
        <button
          class="icon-button"
          type="button"
          :aria-label="queueDrawerOpen ? '关闭当前播放队列' : '展开当前播放队列'"
          @click="queueDrawerOpen = !queueDrawerOpen"
        >
          <PanelRightClose v-if="queueDrawerOpen" :size="20" />
          <PanelRightOpen v-else :size="20" />
        </button>
      </div>
    </header>

    <main class="app-content">
      <LibraryWorkspace
        v-if="page === 'library'"
        @activate="activate"
        @open-context="openContextMenu"
      />
      <QueueWorkspace v-else @activate="activate" @open-context="openContextMenu" />
      <QueueDrawer @activate="activate" @open-context="openContextMenu" />
    </main>

    <PlayerBar />

    <div v-if="settingsOpen" class="settings-menu" @click.stop>
      <strong>索引维护</strong>
      <button type="button" @click="store.refreshAvailability(true); settingsOpen = false">
        <RefreshCw :size="16" />重新检查文件
      </button>
      <button type="button" @click="store.migrateMusicDirectory(); settingsOpen = false">
        <Route :size="16" />迁移音乐目录
      </button>
    </div>

    <div
      v-if="contextMenu.open"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button type="button" @click="contextPlay">播放</button>
      <button
        v-if="contextMenu.source === 'library' || contextMenu.source === 'saved'"
        type="button"
        @click="contextAddToQueue"
      >
        加入当前播放队列
      </button>
      <button v-if="contextNode?.type === 'track'" type="button" @click="contextRepair">
        修复此音乐索引
      </button>
      <button type="button" @click="contextFolderRepair">从文件夹匹配所选项目</button>
      <button type="button" class="danger-text" @click="contextDelete">
        {{ contextMenu.source === 'library' ? '删除索引' : '删除所选项目' }}
      </button>
    </div>

    <div v-if="message" class="toast">{{ message }}</div>
    <div v-if="modeMessage" class="mode-toast">播放模式：{{ modeMessage }}</div>
    <div v-if="errorMessage" class="error-dialog" role="alertdialog" aria-modal="true">
      <div class="error-card">
        <h2>操作未完成</h2>
        <p>{{ errorMessage }}</p>
        <button type="button" @click="store.dismissError">知道了</button>
      </div>
    </div>
  </div>
</template>
