<template>
  <div>
    <h2 class="page-title">系统设置</h2>
    <p class="page-desc">模型与密钥仅保存在本机（浏览器本地或桌面应用本地），不会上传到本系统服务器。修改后需点击保存才会全局生效。</p>

    <section class="panel">
      <el-form label-width="120px">
        <el-form-item label="当前大模型">
          <el-select v-model="draft.currentProvider" style="width: 280px" @change="onProviderChange">
            <el-option
              v-for="item in PROVIDERS"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模型说明">
          <span class="page-desc">{{ currentProvider.visionHint }} 调用模型：{{ currentProvider.model }}</span>
        </el-form-item>
      </el-form>
      <p class="fee-note">所有大模型费用由用户自行承担。本系统只提供调用入口，不代收充值、不赚取差价。</p>
    </section>

    <section class="panel" style="margin-top: 16px">
      <h3>各模型 API Key</h3>
      <el-form label-width="120px">
        <el-form-item v-for="item in PROVIDERS" :key="item.id" :label="item.name">
          <el-input
            v-model="draft.apiKeys[item.id]"
            type="password"
            show-password
            clearable
            :placeholder="`请输入 ${item.name} API Key`"
            style="max-width: 520px"
          />
          <el-button style="margin-left: 8px" :loading="testingId === item.id" @click="testOne(item.id)">
            测试连通性
          </el-button>
        </el-form-item>
      </el-form>
      <div class="toolbar">
        <div></div>
        <div>
          <el-button @click="resetAll">重置所有配置</el-button>
          <el-button type="primary" @click="saveAll">保存配置</el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { PROVIDERS, getProvider } from '@/services/providers'
import { testConnection } from '@/services/ai'

const settings = useSettingsStore()
const testingId = ref('')
const draft = reactive({
  currentProvider: settings.currentProvider,
  apiKeys: { ...settings.apiKeys }
})
const currentProvider = computed(() => getProvider(draft.currentProvider))

function onProviderChange(id) {
  if (!draft.apiKeys[id]) {
    ElMessageBox.alert('请先配置对应大模型API密钥', '提示', {
      confirmButtonText: '知道了',
      type: 'warning'
    })
  }
}

function saveAll() {
  settings.applyDraft(draft)
  ElMessage.success('配置已保存，立即全局生效')
}

async function resetAll() {
  await ElMessageBox.confirm('将清空全部模型选择与密钥记录，恢复默认状态。', '重置配置', {
    type: 'warning',
    confirmButtonText: '确认重置',
    cancelButtonText: '取消'
  })
  settings.reset()
  draft.currentProvider = settings.currentProvider
  draft.apiKeys = { ...settings.apiKeys }
  ElMessage.success('已重置')
}

async function testOne(id) {
  const key = draft.apiKeys[id]
  if (!key) {
    ElMessageBox.alert('请先配置对应大模型API密钥', '无法测试', {
      confirmButtonText: '知道了',
      type: 'warning'
    })
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
