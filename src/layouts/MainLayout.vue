<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <img src="/favicon.svg" alt="logo" />
        <h1>
          AI电路板维修
          <span>{{ runtimeLabel }}</span>
        </h1>
      </div>
      <router-link class="nav-item" to="/repair">维修识别</router-link>
      <router-link class="nav-item" to="/settings">系统设置</router-link>
    </aside>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const runtimeLabel = computed(() =>
  window.electronAPI?.isElectron ? '桌面应用' : '网页模式'
)
</script>
