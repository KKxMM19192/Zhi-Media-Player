<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  Archive,
  Clock3,
  ListMusic,
  Play,
  Plus,
  Save,
  Trash2,
  Wrench
} from '@lucide/vue'
import {
  flattenTracks,
  type NodeId,
  type TreeDestination
} from '../../../shared/domain/music-tree'
import type { QueueHistoryReason } from '../../../shared/domain/queue-state'
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
  busy,
  queueSection,
  queue,
  savedQueues,
  queueHistory,
  shuffle,
  activeSavedQueue,
  activeHistoryEntry,
  selectedQueueIds,
  selectedSavedIds,
  expandedNodeIds,
  unavailableNodeIds,
  dragPayload
} = storeToRefs(store)
const saveName = ref('')
const historySaveName = ref('')
const savedNameDraft = ref('')
const newestHistory = computed(() => [...queueHistory.value].reverse())
const savedQueueMenu = reactive({
  open: false,
  x: 0,
  y: 0,
  savedQueueId: null as NodeId | null
})

watch(
  () => {
    const savedQueue = activeSavedQueue.value
    return savedQueue ? { id: savedQueue.id, name: savedQueue.name } : null
  },
  (savedQueueIdentity) => {
    savedNameDraft.value = savedQueueIdentity?.name ?? ''
  },
  { immediate: true }
)

function historyReason(reason: QueueHistoryReason): string {
  return {
    replace: '整体替换前',
    clear: '清空前',
    restore: '历史恢复前',
    'shuffle-exit': '退出乱序前'
  }[reason]
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function saveQueue(): void {
  const previousCount = savedQueues.value.length
  store.saveCurrentQueue(saveName.value)
  if (savedQueues.value.length > previousCount) {
    saveName.value = ''
  }
}

function saveHistory(): void {
  if (!activeHistoryEntry.value) {
    return
  }
  const previousCount = savedQueues.value.length
  store.saveHistoryAsQueue(activeHistoryEntry.value.id, historySaveName.value)
  if (savedQueues.value.length > previousCount) {
    historySaveName.value = ''
  }
}

function commitSavedName(): void {
  const savedQueue = activeSavedQueue.value
  const normalizedName = savedNameDraft.value.trim()
  if (!savedQueue || !normalizedName) {
    savedNameDraft.value = savedQueue?.name ?? ''
    return
  }
  store.renameSavedQueue(savedQueue.id, normalizedName)
  savedNameDraft.value = normalizedName
}

function destinationFor(
  targetId: NodeId,
  position: 'before' | 'inside' | 'after',
  source: TreeSource
): TreeDestination | null {
  return store.destinationFor(
    targetId,
    position,
    source,
    source === 'saved' ? activeSavedQueue.value?.id ?? null : null
  )
}

function dropNode(source: TreeSource, targetId: NodeId, position: 'before' | 'inside' | 'after'): void {
  const destination = destinationFor(targetId, position, source)
  if (destination) {
    store.dropIntoTree(source, destination, source === 'saved' ? activeSavedQueue.value?.id ?? null : null)
  }
}

function dropExternalNode(
  source: TreeSource,
  files: File[],
  targetId: NodeId,
  position: 'before' | 'inside' | 'after'
): void {
  const destination = destinationFor(targetId, position, source)
  if (destination) {
    void store.importDroppedMusic(
      files,
      source,
      destination,
      source === 'saved' ? activeSavedQueue.value?.id ?? null : null
    )
  }
}

function dropCurrentRoot(event: DragEvent): void {
  event.preventDefault()
  const destination = { parentId: null, index: queue.value.length }
  if (event.dataTransfer?.files.length) {
    void store.importDroppedMusic([...event.dataTransfer.files], 'queue', destination)
  } else {
    store.dropIntoQueue(destination)
  }
}

function dropSavedRoot(event: DragEvent): void {
  event.preventDefault()
  const savedQueueId = activeSavedQueue.value?.id ?? null
  if (!savedQueueId) {
    return
  }
  const destination = { parentId: null, index: activeSavedQueue.value?.nodes.length ?? 0 }
  if (event.dataTransfer?.files.length) {
    void store.importDroppedMusic(
      [...event.dataTransfer.files],
      'saved',
      destination,
      savedQueueId
    )
  } else {
    store.dropIntoTree('saved', destination, savedQueueId)
  }
}

function handleCurrentRootDragOver(event: DragEvent): void {
  applyTreeDropEffect(event, 'queue')
}

function handleSavedRootDragOver(event: DragEvent): void {
  applyTreeDropEffect(event, 'saved')
}

function beginSavedQueueDrag(event: DragEvent, savedQueueId: NodeId): void {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-silent-nocturne-saved-queue', savedQueueId)
  }
  store.beginSavedQueueDrag(savedQueueId)
}

function openSavedQueueMenu(event: MouseEvent, savedQueueId: NodeId): void {
  savedQueueMenu.open = true
  savedQueueMenu.x = Math.min(event.clientX, window.innerWidth - 210)
  savedQueueMenu.y = Math.min(event.clientY, window.innerHeight - 190)
  savedQueueMenu.savedQueueId = savedQueueId
}
</script>

<template>
  <section class="workspace queue-workspace" @click="savedQueueMenu.open = false">
    <div class="workspace-heading queue-heading">
      <div>
        <p class="eyebrow">PLAYBACK QUEUES</p>
        <h1>播放队列</h1>
        <p>当前队列、主动保存的快照和系统维护的恢复历史彼此独立。</p>
      </div>
      <div class="queue-tabs" role="tablist" aria-label="队列视图">
        <button type="button" :class="{ active: queueSection === 'current' }" @click="queueSection = 'current'">
          <ListMusic :size="17" />当前队列
        </button>
        <button type="button" :class="{ active: queueSection === 'saved' }" @click="queueSection = 'saved'">
          <Archive :size="17" />已保存 <span>{{ savedQueues.length }}</span>
        </button>
        <button type="button" :class="{ active: queueSection === 'history' }" @click="queueSection = 'history'">
          <Clock3 :size="17" />历史 <span>{{ queueHistory.length }}</span>
        </button>
      </div>
    </div>

    <div v-if="queueSection === 'current'" class="queue-section">
      <div class="section-toolbar">
        <span v-if="shuffle" class="status-pill">乱序工作队列 · 扁平编辑</span>
        <label class="inline-name-field">
          <span class="sr-only">保存队列名称</span>
          <input v-model="saveName" type="text" maxlength="1024" placeholder="保存为…" @keyup.enter="saveQueue" />
          <button type="button" @click="saveQueue"><Save :size="17" />保存当前队列</button>
        </label>
        <button
          type="button"
          :disabled="selectedQueueIds.size === 0 || busy"
          @click="store.repairSelectedFromFolder('queue')"
        >
          <Wrench :size="17" />文件夹匹配
        </button>
        <button
          class="danger-button"
          type="button"
          :disabled="queue.length === 0"
          @click="store.clearCurrentQueue"
        >
          <Trash2 :size="17" />清空队列
        </button>
      </div>
      <div
        class="tree-panel tree-panel--queue"
        @dragover="handleCurrentRootDragOver"
        @drop="dropCurrentRoot"
      >
        <div v-if="queue.length === 0" class="empty-state">
          <ListMusic :size="40" />
          <h2>当前队列为空</h2>
          <p>从分类歌单、已保存队列或系统资源管理器拖入音乐；整体清空前的内容可从历史恢复。</p>
        </div>
        <MusicTree
          v-else
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
          @drop-node="(targetId, position) => dropNode('queue', targetId, position)"
          @drop-level="(parentId, index) => store.dropIntoQueue({ parentId, index })"
          @drop-external-node="(files, targetId, position) => dropExternalNode('queue', files, targetId, position)"
          @drop-external-level="(files, parentId, index) => store.importDroppedMusic(files, 'queue', { parentId, index })"
        />
      </div>
    </div>

    <div v-else-if="queueSection === 'saved'" class="collection-layout">
      <aside class="collection-list" aria-label="已保存队列">
        <div v-if="savedQueues.length === 0" class="collection-empty">
          <Archive :size="28" />
          <p>还没有已保存队列。</p>
          <small>在“当前队列”中输入名称后保存完整树形快照。</small>
        </div>
        <article
          v-for="savedQueue in savedQueues"
          :key="savedQueue.id"
          class="collection-card"
          :class="{ active: activeSavedQueue?.id === savedQueue.id }"
          draggable="true"
          @click="store.selectSavedQueue(savedQueue.id)"
          @contextmenu.prevent.stop="openSavedQueueMenu($event, savedQueue.id)"
          @dragstart="beginSavedQueueDrag($event, savedQueue.id)"
          @dragend="store.endDrag"
        >
          <div>
            <strong>{{ savedQueue.name }}</strong>
            <small>{{ savedQueue.nodes.length }} 个顶层项目 · {{ formatTimestamp(savedQueue.updatedAt) }}</small>
          </div>
          <div class="card-actions">
            <button type="button" title="替换当前队列并播放" @click.stop="store.replaceQueueWithSaved(savedQueue.id, true)">
              <Play :size="15" />
            </button>
            <button type="button" title="插入当前队列末尾" @click.stop="store.insertSavedQueueIntoQueue(savedQueue.id)">
              <Plus :size="15" />
            </button>
            <button class="danger-text" type="button" title="删除已保存队列" @click.stop="store.deleteSavedQueue(savedQueue.id)">
              <Trash2 :size="15" />
            </button>
          </div>
        </article>
      </aside>

      <div class="collection-editor">
        <div v-if="!activeSavedQueue" class="empty-state">
          <Archive :size="38" />
          <h2>选择一个已保存队列</h2>
          <p>打开只会查看和编辑该独立对象，不会自动改变当前播放队列。</p>
        </div>
        <template v-else>
          <div class="section-toolbar">
            <input
              v-model="savedNameDraft"
              class="editor-title-input"
              type="text"
              maxlength="1024"
              aria-label="已保存队列名称"
              @change="commitSavedName"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
            />
            <button type="button" @click="store.replaceQueueWithSaved(activeSavedQueue.id, true)"><Play :size="17" />播放并替换</button>
            <button type="button" @click="store.insertSavedQueueIntoQueue(activeSavedQueue.id)"><Plus :size="17" />插入当前队列</button>
            <button
              type="button"
              :disabled="selectedSavedIds.size === 0 || busy"
              @click="store.repairSelectedFromFolder('saved')"
            ><Wrench :size="17" />文件夹匹配</button>
            <button
              class="danger-button"
              type="button"
              :disabled="selectedSavedIds.size === 0"
              @click="store.deleteSelected('saved')"
            ><Trash2 :size="17" />删除</button>
          </div>
          <div
            class="tree-panel"
            @dragover="handleSavedRootDragOver"
            @drop="dropSavedRoot"
          >
            <div
              v-if="activeSavedQueue.nodes.length === 0"
              class="empty-state"
            >
              <Archive :size="38" />
              <h2>这个已保存队列为空</h2>
              <p>可从分类歌单、当前队列或系统资源管理器拖入内容。</p>
            </div>
            <MusicTree
              v-else
              :nodes="activeSavedQueue.nodes"
              source="saved"
              :selected-ids="selectedSavedIds"
              :expanded-ids="expandedNodeIds"
              :unavailable-ids="unavailableNodeIds"
              :drag-active="Boolean(dragPayload)"
              @toggle-selection="store.toggleSelection"
              @toggle-expanded="store.toggleExpanded"
              @activate="(source, nodeId) => emit('activate', source, nodeId)"
              @open-context="(event, source, nodeId) => emit('openContext', event, source, nodeId)"
              @begin-drag="store.beginDrag"
              @end-drag="store.endDrag"
              @drop-node="(targetId, position) => dropNode('saved', targetId, position)"
              @drop-level="(parentId, index) => store.dropIntoTree('saved', { parentId, index }, activeSavedQueue?.id ?? null)"
              @drop-external-node="(files, targetId, position) => dropExternalNode('saved', files, targetId, position)"
              @drop-external-level="(files, parentId, index) => store.importDroppedMusic(files, 'saved', { parentId, index }, activeSavedQueue?.id ?? null)"
            />
          </div>
        </template>
      </div>
    </div>

    <div v-else class="collection-layout">
      <aside class="collection-list" aria-label="队列历史">
        <div v-if="newestHistory.length === 0" class="collection-empty">
          <Clock3 :size="28" />
          <p>还没有队列历史。</p>
          <small>整体替换、清空、恢复和退出乱序前会自动记录。</small>
        </div>
        <article
          v-for="entry in newestHistory"
          :key="entry.id"
          class="collection-card"
          :class="{ active: activeHistoryEntry?.id === entry.id }"
          @click="store.selectHistoryEntry(entry.id)"
        >
          <div>
            <strong>{{ historyReason(entry.reason) }}</strong>
            <small>{{ flattenTracks(entry.nodes).length }} 首音乐 · {{ formatTimestamp(entry.createdAt) }}</small>
          </div>
        </article>
      </aside>

      <div class="collection-editor">
        <div v-if="!activeHistoryEntry" class="empty-state">
          <Clock3 :size="38" />
          <h2>选择一条历史记录</h2>
          <p>历史内容只读；恢复不会立即删除该记录。</p>
        </div>
        <template v-else>
          <div class="section-toolbar">
            <strong>{{ historyReason(activeHistoryEntry.reason) }}</strong>
            <button type="button" @click="store.restoreQueueHistory(activeHistoryEntry.id)"><Clock3 :size="17" />恢复到当前队列</button>
            <label class="inline-name-field">
              <input v-model="historySaveName" type="text" maxlength="1024" placeholder="另存为…" @keyup.enter="saveHistory" />
              <button type="button" @click="saveHistory"><Save :size="17" />另存</button>
            </label>
          </div>
          <div class="tree-panel">
            <div v-if="activeHistoryEntry.nodes.length === 0" class="empty-state">
              <Clock3 :size="38" />
              <h2>这是一份空队列快照</h2>
            </div>
            <MusicTree
              v-else
              readonly
              :allow-drop="false"
              :nodes="activeHistoryEntry.nodes"
              source="queue"
              :selected-ids="new Set()"
              :expanded-ids="expandedNodeIds"
              :unavailable-ids="unavailableNodeIds"
              @toggle-expanded="store.toggleExpanded"
            />
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="savedQueueMenu.open && savedQueueMenu.savedQueueId"
      class="context-menu"
      :style="{ left: `${savedQueueMenu.x}px`, top: `${savedQueueMenu.y}px` }"
      @click.stop
    >
      <button
        type="button"
        @click="store.replaceQueueWithSaved(savedQueueMenu.savedQueueId, true); savedQueueMenu.open = false"
      >
        播放并替换当前队列
      </button>
      <button
        type="button"
        @click="store.insertSavedQueueIntoQueue(savedQueueMenu.savedQueueId); savedQueueMenu.open = false"
      >
        作为同名歌单插入
      </button>
      <button
        type="button"
        class="danger-text"
        @click="store.deleteSavedQueue(savedQueueMenu.savedQueueId); savedQueueMenu.open = false"
      >
        删除已保存队列
      </button>
    </div>
  </section>
</template>
