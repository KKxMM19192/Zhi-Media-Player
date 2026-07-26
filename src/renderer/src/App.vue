<script setup lang="ts">
import { Moon } from '@lucide/vue'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-brand">
        <Moon :size="20" aria-hidden="true" />
        <span>Silent Nocturne</span>
      </div>
    </header>

    <main class="app-content">
      <section class="welcome-panel">
        <Moon :size="44" aria-hidden="true" />
        <h1>Silent Nocturne</h1>
        <p>本地音乐播放器</p>
      </section>
    </main>
  </div>
</template>
