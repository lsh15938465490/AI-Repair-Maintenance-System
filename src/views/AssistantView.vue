<template>
  <div class="assistant-page">
    <header class="assistant-head">
      <h2 class="page-title">智能助手</h2>
      <p class="page-desc">
        按问题检索本地知识库。已启用 {{ knowledge.enabledCount }} 篇资料。
        <router-link to="/knowledge" class="inline-link">管理知识库</router-link>
      </p>
    </header>

    <section class="panel chat-panel">
      <div ref="listRef" class="chat-list">
        <div v-if="!messages.length" class="chat-empty">
          输入电路板维修相关问题，例如「保险丝怎么排查」或资料中的型号名称。
        </div>
        <article v-for="item in messages" :key="item.id" class="bubble" :class="item.role">
          <strong>{{ item.role === 'user' ? '我' : '助手' }}</strong>
          <div v-if="item.thinking" class="thinking">
            <span class="thinking-dots" aria-hidden="true">
              <i /><i /><i />
            </span>
            <span>正在思考</span>
          </div>
          <p v-if="item.text" class="bubble-text">
            {{ item.text }}<span v-if="item.streaming" class="stream-caret">▍</span>
          </p>
          <div v-if="!item.streaming && item.hits?.length" class="hit-list">
            <div v-for="(hit, index) in item.hits" :key="`${item.id}-${index}`" class="hit-card">
              <div class="hit-head">
                <span>{{ hit.name || '未命名资料' }}</span>
                <em>相关度 {{ hit.score.toFixed(2) }}</em>
              </div>
              <p>{{ hit.text }}</p>
            </div>
          </div>
        </article>
      </div>
      <form class="chat-input" @submit.prevent="send">
        <el-input
          v-model="draft"
          type="textarea"
          :rows="2"
          maxlength="500"
          show-word-limit
          placeholder="输入要查找的问题"
          @keydown.enter.exact.prevent="send"
        />
        <el-button type="primary" :loading="loading" native-type="submit">
          查找
        </el-button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useSettingsStore } from '@/stores/settings'
import { retrieveChunksByQuery } from '@/services/rag'
import { streamKnowledgeAssistant, typeText } from '@/services/ai'

const knowledge = useKnowledgeStore()
const settings = useSettingsStore()
const draft = ref('')
const loading = ref(false)
const messages = ref([])
const listRef = ref(null)

onMounted(() => {
  knowledge.load().catch(() => {
    ElMessage.error('本地知识库读取失败')
  })
})

async function scrollBottom() {
  await nextTick()
  const el = listRef.value
  if (el) el.scrollTop = el.scrollHeight
}

async function send() {
  const question = draft.value.trim()
  if (!question || loading.value) return
  if (!knowledge.enabledCount) {
    ElMessage.warning('请先在知识库上传并启用资料')
    return
  }

  messages.value.push({
    id: `${Date.now()}-q`,
    role: 'user',
    text: question
  })
  const reply = {
    id: `${Date.now()}-a`,
    role: 'assistant',
    text: '',
    thinking: true,
    streaming: true,
    hits: []
  }
  messages.value.push(reply)
  draft.value = ''
  loading.value = true
  await scrollBottom()

  const append = (piece) => {
    if (!piece) return
    if (reply.thinking) reply.thinking = false
    reply.text += piece
    scrollBottom()
  }

  try {
    const hits = retrieveChunksByQuery(knowledge.enabledDocuments, question)
    reply.hits = hits
    if (!hits.length) {
      await typeText('知识库中没有检索到与该问题匹配的内容。可换关键词，或到知识库补充资料。', append)
    } else if (settings.currentKey) {
      await streamKnowledgeAssistant({
        providerId: settings.currentProvider,
        apiKey: settings.currentKey,
        question,
        hits,
        onDelta: append
      })
      if (!reply.text) {
        await typeText('模型没有返回文字，请稍后重试。', append)
      }
    } else {
      await typeText(
        `已从知识库找到 ${hits.length} 条相关片段（未配置 API 密钥，仅展示检索结果）。可到系统设置填写密钥后获得归纳回答。`,
        append
      )
    }
  } catch (error) {
    if (!reply.text) {
      await typeText(error.message || '查找失败', append)
    }
  } finally {
    reply.thinking = false
    reply.streaming = false
    loading.value = false
    await scrollBottom()
  }
}
</script>

<style scoped>
.assistant-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
  min-height: 0;
  overflow: hidden;
}

.assistant-head {
  flex-shrink: 0;
}

.assistant-head .page-desc {
  margin-bottom: 12px;
}

.inline-link {
  color: var(--accent);
  margin-left: 8px;
}

.chat-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.chat-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-empty {
  margin: auto;
  color: var(--muted);
  font-size: 13px;
}

.bubble {
  max-width: 92%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #10182a;
}

.bubble.user {
  align-self: flex-end;
  background: rgba(62, 224, 197, 0.1);
}

.bubble.assistant {
  align-self: flex-start;
}

.bubble strong {
  font-size: 12px;
  color: var(--accent);
}

.bubble-text {
  margin: 6px 0 0;
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 14px;
}

.thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
}

.thinking-dots {
  display: inline-flex;
  gap: 4px;
}

.thinking-dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: thinking-bounce 1s ease-in-out infinite;
}

.thinking-dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.thinking-dots i:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes thinking-bounce {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

.stream-caret {
  display: inline-block;
  margin-left: 1px;
  color: var(--accent);
  animation: caret-blink 0.9s step-end infinite;
}

@keyframes caret-blink {
  50% {
    opacity: 0;
  }
}

.hit-list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}

.hit-card {
  background: #0b1220;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
}

.hit-card .hit-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--accent);
}

.hit-card em {
  color: var(--muted);
  font-style: normal;
}

.hit-card p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 8em;
  overflow: auto;
}

.chat-input {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  align-items: flex-end;
  padding-top: 4px;
  background: var(--panel);
}

.chat-input :deep(.el-textarea) {
  flex: 1;
}
</style>
