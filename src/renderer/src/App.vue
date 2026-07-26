<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import {
  FolderPlus,
  Library,
  ListMusic,
  Menu,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Trash2,
  X
} from '@lucide/vue'
import MusicTree from './components/MusicTree.vue'
import PlayerBar from './components/PlayerBar.vue'
import { flattenTracks, findNode, type NodeId } from '../../shared/domain/music-tree'
import type { PlaybackSource } from '../../shared/domain/playback'
import { useAppStore } from './stores/app-store'

const store = useAppStore()
const {
  initialized,
  busy,
  page,
  queueDrawerOpen,
  library,
  queue,
  selectedLibraryIds,
  selectedQueueIds,
  expandedNodeIds,
  unavailableNodeIds,
  queueTrackCount,
  message,
  errorMessage
} = storeToRefs(store)

const contextMenu = reactive<{
  open: boolean
  x: number
  y: number
  source: PlaybackSource
  nodeId: NodeId | null
}>({
  open: false,
  x: 0,
  y: 0,
  source: 'library',
  nodeId: null
})

function activate(source: PlaybackSource, nodeId: NodeId): void {
  store.selectForContextMenu(source, nodeId)
  const roots = source === 'queue' ? queue.value : library.value
  const node = findNode(roots, nodeId)
  if (!node) {
    return
  }
  if (node.type === 'playlist') {
    if (!expandedNodeIds.value.has(node.id)) {
      store.toggleExpanded(node.id)
    }
    const firstTrack =
      source === 'library'
        ? node.children.find((child) => child.type === 'track')
        : flattenTracks([node])[0]
    if (firstTrack) {
      void store.playTrack(firstTrack.id, source)
    }
  } else {
    void store.playTrack(node.id, source)
  }
}

function openContextMenu(event: MouseEvent, source: PlaybackSource, nodeId: NodeId): void {
  store.selectForContextMenu(source, nodeId)
  contextMenu.open = true
  contextMenu.x = Math.min(event.clientX, window.innerWidth - 190)
  contextMenu.y = Math.min(event.clientY, window.innerHeight - 210)
  contextMenu.source = source
  contextMenu.nodeId = nodeId
}

function closeContextMenu(): void {
  contextMenu.open = false
}

function contextPlay(): void {
  if (contextMenu.nodeId) {
    activate(contextMenu.source, contextMenu.nodeId)
  }
  closeContextMenu()
}

function contextAddToQueue(): void {
  store.addSelectedLibraryToQueue()
  queueDrawerOpen.value = true
  closeContextMenu()
}

function contextDelete(): void {
  store.deleteSelected(contextMenu.source)
  closeContextMenu()
}

function dropOnNode(targetId: NodeId, position: 'before' | 'inside' | 'after'): void {
  const destination = store.destinationFor(targetId, position)
  if (destination) {
    store.dropIntoQueue(destination)
  }
}

function dropAtLevel(parentId: NodeId | null, index: number): void {
  store.dropIntoQueue({ parentId, index })
}

function dropAtRoot(): void {
  dropAtLevel(null, queue.value.length)
}

onMounted(() => {
  void store.initialize()
  window.silentNocturne.onPrepareClose(() => {
    void store.flushState().finally(() => window.silentNocturne.completeClose())
  })
})
</script>

<template>
  <div class="app-shell" @click="closeContextMenu">
    <header class="app-header">
      <div class="app-brand">
        <Music2 :size="20" aria-hidden="true" />
        <span>Silent Nocturne</span>
      </div>

      <nav class="primary-nav" aria-label="主要页面">
        <button
          type="button"
          :class="{ active: page === 'library' }"
          @click="page = 'library'"
        >
          <Library :size="18" />
          分类歌单
        </button>
        <button
          type="button"
          :class="{ active: page === 'queue' }"
          @click="page = 'queue'"
        >
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
      <section v-if="page === 'library'" class="workspace">
        <div class="workspace-heading">
          <div>
            <p class="eyebrow">LOCAL COLLECTION</p>
            <h1>分类歌单</h1>
            <p>组织本地索引；删除项目不会改动磁盘上的音乐文件。</p>
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

        <div class="tree-panel">
          <div v-if="!initialized" class="empty-state">
            <Menu :size="34" />
            <p>正在载入应用状态…</p>
          </div>
          <div v-else-if="library.length === 0" class="empty-state">
            <Library :size="40" />
            <h2>导入第一份本地音乐</h2>
            <p>选择包含 MP3 或 FLAC 的文件夹，目录层级会转换为歌单树。</p>
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
            @toggle-selection="store.toggleSelection"
            @toggle-expanded="store.toggleExpanded"
            @activate="activate"
            @open-context="openContextMenu"
            @begin-drag="store.beginDrag"
            @end-drag="store.endDrag"
          />
        </div>
      </section>

      <section v-else class="workspace">
        <div class="workspace-heading">
          <div>
            <p class="eyebrow">NOW PLAYING ORDER</p>
            <h1>当前播放队列</h1>
            <p>队列按界面从上到下递归展开；拖动可调整顺序和层级。</p>
          </div>
          <div class="toolbar">
            <button
              class="danger-button"
              type="button"
              :disabled="selectedQueueIds.size === 0"
              @click="store.deleteSelected('queue')"
            >
              <Trash2 :size="18" />
              删除
            </button>
          </div>
        </div>
        <div class="tree-panel tree-panel--queue">
          <div v-if="queue.length === 0" class="empty-state">
            <ListMusic :size="40" />
            <h2>当前队列为空</h2>
            <p>从分类歌单选择音乐或歌单，然后加入队列；也可以直接拖到这里。</p>
          </div>
          <MusicTree
            v-else
            :nodes="queue"
            source="queue"
            :selected-ids="selectedQueueIds"
            :expanded-ids="expandedNodeIds"
            :unavailable-ids="unavailableNodeIds"
            @toggle-selection="store.toggleSelection"
            @toggle-expanded="store.toggleExpanded"
            @activate="activate"
            @open-context="openContextMenu"
            @begin-drag="store.beginDrag"
            @end-drag="store.endDrag"
            @drop-node="dropOnNode"
            @drop-level="dropAtLevel"
          />
          <div
            class="panel-root-drop"
            @dragover.prevent
            @drop.prevent="dropAtRoot"
          >
            拖到空白处可追加到队列末尾
          </div>
        </div>
      </section>

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
        <div class="drawer-body">
          <div
            v-if="queue.length === 0"
            class="drawer-empty"
            @dragover.prevent
            @drop.prevent="dropAtRoot"
          >
            从左侧拖入音乐或歌单
          </div>
          <MusicTree
            v-else
            compact
            :nodes="queue"
            source="queue"
            :selected-ids="selectedQueueIds"
            :expanded-ids="expandedNodeIds"
            :unavailable-ids="unavailableNodeIds"
            @toggle-selection="store.toggleSelection"
            @toggle-expanded="store.toggleExpanded"
            @activate="activate"
            @open-context="openContextMenu"
            @begin-drag="store.beginDrag"
            @end-drag="store.endDrag"
            @drop-node="dropOnNode"
            @drop-level="dropAtLevel"
          />
          <div
            class="drawer-root-drop"
            @dragover.prevent
            @drop.prevent="dropAtRoot"
          >
            拖到这里追加
          </div>
        </div>
      </aside>
    </main>

    <PlayerBar />

    <div
      v-if="contextMenu.open"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button type="button" @click="contextPlay">播放</button>
      <button
        v-if="contextMenu.source === 'library'"
        type="button"
        @click="contextAddToQueue"
      >
        加入当前播放队列
      </button>
      <button type="button" class="danger-text" @click="contextDelete">
        {{ contextMenu.source === 'library' ? '删除索引' : '从队列删除' }}
      </button>
    </div>

    <div v-if="message" class="toast">{{ message }}</div>
    <div v-if="errorMessage" class="error-dialog" role="alertdialog" aria-modal="true">
      <div class="error-card">
        <h2>操作未完成</h2>
        <p>{{ errorMessage }}</p>
        <button type="button" @click="store.dismissError">知道了</button>
      </div>
    </div>
  </div>
</template>
