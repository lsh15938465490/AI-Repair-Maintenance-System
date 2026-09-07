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
      <router-link class="nav-item" to="/assistant">智能助手</router-link>
      <router-link class="nav-item" to="/knowledge">知识库</router-link>
      <router-link class="nav-item" to="/materials">素材库</router-link>
      <router-link class="nav-item" to="/settings">系统设置</router-link>
      <router-link class="nav-item" to="/search">查找</router-link>
    </aside>
    <main class="content" :class="{ 'content-lock': lockScroll }">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const lockScroll = computed(() => ['/repair', '/assistant'].includes(route.path))

const runtimeLabel = computed(() =>
  window.electronAPI?.isElectron ? '桌面应用' : '网页模式'
)
</script>
