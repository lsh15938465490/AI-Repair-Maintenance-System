<template>
  <div>
    <h2 class="page-title">系统设置</h2>
    <p class="page-desc">
      模型与密钥仅保存在本机，不会上传到本系统服务器。当前模型的 API Key 格式正确后会自动保存并立即生效。
    </p>

    <section class="panel">
      <el-form label-width="120px">
        <el-form-item label="当前大模型">
          <div class="current-model-row">
            <el-select v-model="draft.currentProvider" style="width: 200px" @change="onProviderChange">
              <el-option
                v-for="item in PROVIDERS"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
            <el-input
              :model-value="displayApiKey(draft.currentProvider)"
              :readonly="Boolean(draft.apiKeys[draft.currentProvider]) && !revealed[draft.currentProvider]"
              clearable
              class="api-key-input"
              :placeholder="`请输入 ${currentProvider.name} API Key`"
              @clear="clearKey(draft.currentProvider)"
              @blur="onKeyBlur(draft.currentProvider)"
              @update:model-value="(value) => onKeyInput(draft.currentProvider, value)"
            >
              <template #suffix>
                <el-icon class="key-toggle" @click="toggleReveal(draft.currentProvider)">
                  <View v-if="!revealed[draft.currentProvider]" />
                  <Hide v-else />
                </el-icon>
              </template>
            </el-input>
            <el-button :loading="testingId === draft.currentProvider" @click="testOne(draft.currentProvider)">
              测试连通性
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="模型说明">
          <div class="model-help">
            <span class="page-desc">{{ currentProvider.visionHint }} 调用模型：{{ currentProvider.model }}</span>
            <p class="page-desc key-url-line">
              购买 / 申请 API Key：
              <a
                class="key-url"
                :href="currentProvider.keyUrl"
                target="_blank"
                rel="noopener noreferrer"
              >{{ currentProvider.keyUrl }}</a>
            </p>
          </div>
        </el-form-item>
      </el-form>
      <p class="fee-note">所有大模型费用由用户自行承担。本系统只提供调用入口，不代收充值、不赚取差价。</p>
    </section>
  </div>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref } from 'vue'
import { View, Hide } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { PROVIDERS, getProvider } from '@/services/providers'
import { testConnection } from '@/services/ai'
import { maskApiKey } from '@/utils/mask'

const settings = useSettingsStore()
const testingId = ref('')
const revealed = reactive({})
const draft = reactive({
  currentProvider: settings.currentProvider,
  apiKeys: { ...settings.apiKeys }
})
const currentProvider = computed(() => getProvider(draft.currentProvider))
let saveTimer = 0

function isValidApiKey(value) {
  const key = String(value || '').trim()
  if (key.length < 16 || key.includes('*')) return false
  return /^[A-Za-z0-9_\-:.]+$/.test(key)
}

function displayApiKey(id) {
  const key = draft.apiKeys[id] || ''
  return revealed[id] ? key : maskApiKey(key)
}

function persistDraft(showTip) {
  settings.applyDraft(draft)
  if (showTip) ElMessage.success('API Key 已自动保存')
}

function tryAutoSave(id, { forceTip = false, remask = false } = {}) {
  const key = (draft.apiKeys[id] || '').trim()
  if (!isValidApiKey(key)) return
  draft.apiKeys[id] = key
  const changed = settings.apiKeys[id] !== key || settings.currentProvider !== draft.currentProvider
  persistDraft(forceTip || changed)
  if (remask) revealed[id] = false
}

function onKeyInput(id, value) {
  if (draft.apiKeys[id] && !revealed[id]) return
  draft.apiKeys[id] = value
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => tryAutoSave(id), 400)
}

function onKeyBlur(id) {
  window.clearTimeout(saveTimer)
  tryAutoSave(id, { remask: true })
}

function toggleReveal(id) {
  revealed[id] = !revealed[id]
}

function clearKey(id) {
  draft.apiKeys[id] = ''
  revealed[id] = true
  persistDraft(false)
}

function onProviderChange(id) {
  settings.applyDraft(draft)
  revealed[id] = false
}

onUnmounted(() => window.clearTimeout(saveTimer))

async function testOne(id) {
  const key = draft.apiKeys[id]
  if (!key) {
    ElMessage.warning('请先填写 API Key，或点击下方网址申请')
    return
  }
  testingId.value = id
  try {
    const reply = await testConnection({ providerId: id, apiKey: key })
    ElMessageBox.alert(`连通成功。模型回复：${reply}`, '测试连通性', {
      confirmButtonText: '好的',
      type: 'success'
    })
  } catch (error) {
    ElMessageBox.alert(error.message || '连通失败', '测试连通性失败', {
      confirmButtonText: '知道了',
      type: 'error'
    })
  } finally {
    testingId.value = ''
  }
}
</script>

<style scoped>
.current-model-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.current-model-row .api-key-input {
  flex: 1;
  min-width: 240px;
  max-width: 420px;
}

.api-key-input :deep(.el-input__inner) {
  font-family: Consolas, "Courier New", monospace;
  letter-spacing: 0.5px;
}

.key-toggle {
  cursor: pointer;
  color: var(--muted);
}

.key-toggle:hover {
  color: var(--accent);
}

.model-help {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.key-url-line {
  margin: 0;
  word-break: break-all;
}

.key-url {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.key-url:hover {
  color: #7af0dc;
}
</style>
