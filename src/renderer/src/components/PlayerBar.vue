<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Music, Pause, Play, SkipBack, SkipForward, Volume2 } from '@lucide/vue'
import { useAppStore } from '../stores/app-store'

const store = useAppStore()
const {
  currentTrack,
  paused,
  positionSeconds,
  durationSeconds,
  volume,
  coverDataUrl
} = storeToRefs(store)
const audio = ref<HTMLAudioElement | null>(null)
let mediaRequest = 0

const progressMaximum = computed(() => Math.max(durationSeconds.value, positionSeconds.value, 1))

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0:00'
  }
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}

watch(
  () => currentTrack.value?.id,
  async () => {
    const request = ++mediaRequest
    const element = audio.value
    const track = currentTrack.value
    if (!element) {
      return
    }
    element.pause()
    element.removeAttribute('src')
    element.load()
    if (!track) {
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
      store.markPlaybackError()
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
  if (positionSeconds.value > 0 && positionSeconds.value < audio.value.duration) {
    audio.value.currentTime = positionSeconds.value
  }
  if (!paused.value) {
    void audio.value.play().catch(() => {
      store.paused = true
    })
  }
}

function seek(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (audio.value) {
    audio.value.currentTime = value
  }
  store.updatePosition(value)
}
</script>

<template>
  <footer class="player-bar">
    <audio
      ref="audio"
      @loadedmetadata="handleLoadedMetadata"
      @timeupdate="audio && store.updatePosition(audio.currentTime)"
      @durationchange="audio && store.updateDuration(audio.duration)"
      @ended="store.playAdjacent(1)"
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
      </div>

      <label class="volume-control">
        <Volume2 :size="20" aria-hidden="true" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="volume"
          aria-label="音量"
          @input="store.updateVolume(Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>
  </footer>
</template>
