<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import {
  ListMusic,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from '@lucide/vue'
import { useAppStore } from '../stores/app-store'

const store = useAppStore()
const {
  currentTrack,
  paused,
  positionSeconds,
  durationSeconds,
  volume,
  coverDataUrl,
  playbackMode,
  mediaRevision
} = storeToRefs(store)
const audio = ref<HTMLAudioElement | null>(null)
const mediaLoading = ref(false)
const volumeOpen = ref(false)
let mediaRequest = 0
let pendingResumePositionSeconds = 0

const progressMaximum = computed(() => Math.max(durationSeconds.value, positionSeconds.value, 1))
const playbackModeLabel = computed(
  () =>
    ({
      sequential: '顺序播放',
      'repeat-all': '顺序循环',
      'repeat-one': '单曲循环',
      shuffle: '乱序播放'
    })[playbackMode.value]
)

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0:00'
  }
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

watch(
  mediaRevision,
  async () => {
    const request = ++mediaRequest
    const element = audio.value
    const track = currentTrack.value
    if (!element) {
      return
    }
    pendingResumePositionSeconds = track ? positionSeconds.value : 0
    mediaLoading.value = Boolean(track)
    element.pause()
    element.removeAttribute('src')
    if (!track) {
      mediaLoading.value = false
      return
    }

    try {
      const mediaUrl = await window.silentNocturne.getMediaUrl(track.path)
      if (request !== mediaRequest || currentTrack.value?.id !== track.id) {
        return
      }
      element.src = mediaUrl
      element.load()
    } catch {
      if (request === mediaRequest && currentTrack.value?.id === track.id) {
        pendingResumePositionSeconds = 0
        mediaLoading.value = false
        store.markPlaybackError()
      }
    }
  },
  { immediate: true, flush: 'post' }
)

watch(paused, async (isPaused) => {
  const element = audio.value
  if (!element || !currentTrack.value) {
    return
  }
  if (isPaused) {
    element.pause()
    return
  }
  if (mediaLoading.value || !element.currentSrc) {
    return
  }
  try {
    await element.play()
  } catch {
    store.paused = true
    store.errorMessage = '系统未能开始播放，请重试或检查音频输出。'
  }
})

watch(volume, (nextVolume) => {
  if (audio.value) {
    audio.value.volume = nextVolume
  }
})

function handleLoadedMetadata(): void {
  if (!audio.value) {
    return
  }
  audio.value.volume = volume.value
  store.updateDuration(audio.value.duration)
  if (pendingResumePositionSeconds > 0) {
    const restoredPosition = Number.isFinite(audio.value.duration)
      ? Math.min(pendingResumePositionSeconds, Math.max(0, audio.value.duration))
      : 0
    audio.value.currentTime = restoredPosition
    if (restoredPosition !== positionSeconds.value) {
      store.updatePosition(restoredPosition)
    }
  }
  pendingResumePositionSeconds = 0
  mediaLoading.value = false
  if (!paused.value) {
    void audio.value.play().catch(() => {
      store.paused = true
      store.errorMessage = '系统未能开始播放，请重试或检查音频输出。'
    })
  }
}

function seek(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (mediaLoading.value) {
    pendingResumePositionSeconds = value
  }
  if (audio.value) {
    audio.value.currentTime = value
  }
  store.updatePosition(value)
}

function handleTimeUpdate(): void {
  if (!audio.value || mediaLoading.value) {
    return
  }
  store.updatePosition(audio.value.currentTime)
}
</script>

<template>
  <footer class="player-bar">
    <audio
      ref="audio"
      @loadedmetadata="handleLoadedMetadata"
      @timeupdate="handleTimeUpdate"
      @durationchange="audio && store.updateDuration(audio.duration)"
      @ended="store.playAdjacent(1, 'track-ended')"
      @error="currentTrack && store.markPlaybackError()"
    />

    <div class="progress-row">
      <span>{{ formatTime(positionSeconds) }}</span>
      <input
        class="progress-slider"
        type="range"
        min="0"
        :max="progressMaximum"
        step="0.1"
        :value="positionSeconds"
        :disabled="!currentTrack"
        aria-label="播放进度"
        @input="seek"
      />
      <span>{{ formatTime(durationSeconds) }}</span>
    </div>

    <div class="player-main">
      <div class="now-playing">
        <div class="cover">
          <img v-if="coverDataUrl" :src="coverDataUrl" alt="" />
          <Music v-else :size="24" aria-hidden="true" />
        </div>
        <div class="now-playing-copy">
          <strong>{{ currentTrack?.name ?? '尚未选择音乐' }}</strong>
          <span>{{ currentTrack ? '本地音乐' : '从分类歌单或队列开始播放' }}</span>
        </div>
      </div>

      <div class="transport-controls">
        <button
          type="button"
          class="icon-button"
          aria-label="上一首"
          :disabled="!currentTrack"
          @click="store.playAdjacent(-1)"
        >
          <SkipBack :size="21" />
        </button>
        <button
          type="button"
          class="play-button"
          :aria-label="paused ? '播放' : '暂停'"
          @click="store.togglePlayback"
        >
          <Play v-if="paused" :size="23" fill="currentColor" />
          <Pause v-else :size="23" fill="currentColor" />
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label="下一首"
          :disabled="!currentTrack"
          @click="store.playAdjacent(1)"
        >
          <SkipForward :size="21" />
        </button>
        <button
          type="button"
          class="icon-button mode-button"
          :aria-label="`切换播放模式，当前为${playbackModeLabel}`"
          :title="`当前模式：${playbackModeLabel}`"
          @click="store.cyclePlaybackMode"
        >
          <ListMusic v-if="playbackMode === 'sequential'" :size="20" />
          <Repeat v-else-if="playbackMode === 'repeat-all'" :size="20" />
          <Repeat1 v-else-if="playbackMode === 'repeat-one'" :size="20" />
          <Shuffle v-else :size="20" />
        </button>
      </div>

      <div class="volume-control" :class="{ open: volumeOpen }">
        <button
          type="button"
          class="icon-button"
          :aria-label="volumeOpen ? '收起音量滑块' : '展开音量滑块'"
          @click="volumeOpen = !volumeOpen"
        >
          <VolumeX v-if="volume === 0" :size="20" />
          <Volume2 v-else :size="20" />
        </button>
        <input
          v-show="volumeOpen"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          aria-label="音量"
          @input="store.updateVolume(Number(($event.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </footer>
</template>
