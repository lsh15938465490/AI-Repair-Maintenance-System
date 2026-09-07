<template>
  <div>
    <h2 class="page-title">查找</h2>
    <p class="page-desc">
      按品类、产品和品牌检索公开网页中的电路板图片，或由当前模型优化关键词后检索、生成原创教学示意图。查找结果会临时写入本机 search 文件夹，超过 30 分钟自动删除。
    </p>

    <section class="panel">
      <el-form label-width="120px">
        <el-form-item label="查找方式">
          <el-radio-group v-model="engine">
            <el-radio-button label="crawler">全网检索</el-radio-button>
            <el-radio-button label="model">模型检索 / 生成</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="engine === 'model'" label="模型动作">
          <el-radio-group v-model="modelAction">
            <el-radio-button label="search">用模型优化关键词后全网检索</el-radio-button>
            <el-radio-button label="generate">生成原创教学电路图标</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="常用品类">
          <el-select v-model="categoryId" style="width: 240px" @change="onCategoryChange">
            <el-option v-for="item in CATEGORIES" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="家电 / 产品">
          <el-select v-model="productId" style="width: 240px" @change="onProductChange">
            <el-option v-for="item in products" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="常用品牌">
          <el-select v-model="brand" style="width: 240px">
            <el-option label="不限定品牌" :value="ALL_BRAND_VALUE" />
            <el-option v-for="item in brands" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="补充关键词">
          <el-input
            v-model="extra"
            style="max-width: 420px"
            placeholder="例如：电源板、主控板、显示板"
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="runSearch">开始查找</el-button>
          <span class="page-desc" style="margin-left: 12px">当前模型：{{ providerName }}</span>
        </el-form-item>
      </el-form>
      <p class="fee-note">
        全网图片来自公开搜索索引，版权归原网站/作者。仅供维修对照，请自行核权，不得用于仿冒或传播破解资料。
      </p>
    </section>

    <section class="panel" style="margin-top: 16px">
      <div class="toolbar" style="margin-top: 0">
        <h3 style="margin: 0">查找结果</h3>
        <span class="page-desc" style="margin: 0">{{ statusText }}</span>
      </div>
      <div v-if="results.length" class="result-cards">
        <article v-for="item in results" :key="item.id" class="icon-card">
          <div class="icon-thumb" title="点击查看大图" @click="openPreview(item)">
            <img v-if="item.thumb" :src="item.thumb" :alt="item.title" />
            <div v-else-if="item.svg" class="svg-box" v-html="item.svg"></div>
          </div>
          <strong>{{ item.title }}</strong>
          <p class="page-desc" style="margin: 6px 0">
            {{ item.source }} · {{ item.license }} · {{ item.creator }}
          </p>
          <div class="card-actions">
            <el-button size="small" type="primary" @click="downloadItem(item)">下载</el-button>
            <el-button
              size="small"
              :disabled="materials.isSaved(item)"
              :loading="savingKey === itemKey(item)"
              @click="saveToMaterials(item)"
            >
              {{ materials.isSaved(item) ? '已保存' : '保存到素材库' }}
            </el-button>
          </div>
        </article>
      </div>
      <p v-else class="page-desc">{{ emptyText }}</p>
    </section>

    <el-dialog
      v-model="previewOpen"
      class="icon-preview-dialog"
      :title="previewItem?.title || '查看图标'"
      width="860px"
      append-to-body
      destroy-on-close
    >
      <p v-if="previewItem" class="page-desc" style="margin-bottom: 12px">
        {{ previewItem.source }} · {{ previewItem.license }} · {{ previewItem.creator }}
      </p>
      <div class="icon-preview-stage">
        <img v-if="previewItem?.thumb" :src="previewSrc" :alt="previewItem?.title" />
        <div v-else-if="previewItem?.svg" class="svg-box" v-html="previewItem.svg"></div>
      </div>
      <template #footer>
        <el-button type="primary" @click="downloadItem(previewItem)">下载</el-button>
        <el-button
          :disabled="previewItem && materials.isSaved(previewItem)"
          :loading="previewItem && savingKey === itemKey(previewItem)"
          @click="saveToMaterials(previewItem)"
        >
          {{ previewItem && materials.isSaved(previewItem) ? '已保存' : '保存到素材库' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useMaterialsStore } from '@/stores/materials'
import { getProvider } from '@/services/providers'
import { planOrGenerateBoardIcon } from '@/services/ai'
import {
  ALL_BRAND_VALUE,
  CATEGORIES,
  getCategory,
  getProduct
} from '@/data/pcbIconCatalog'
import {
  sanitizeSvg,
  searchLegalBoardImages,
  svgToDataUrl
} from '@/services/iconSearch'
import { cacheSearchResults, purgeSearchCache } from '@/utils/searchFolder'

const router = useRouter()
const settings = useSettingsStore()
const materials = useMaterialsStore()
const savingKey = ref('')
const engine = ref('crawler')
const modelAction = ref('search')
const categoryId = ref('appliance')
const productId = ref('washer')
const brand = ref(ALL_BRAND_VALUE)
const extra = ref('')
const loading = ref(false)
const results = ref([])
const statusText = ref('尚未查找')
const previewOpen = ref(false)
const previewItem = ref(null)

const previewSrc = computed(() => {
  const item = previewItem.value
  if (!item) return ''
  if (item.svg) return svgToDataUrl(item.svg)
  return item.url || item.thumb || ''
})

const providerName = computed(() => getProvider(settings.currentProvider).name)
const products = computed(() => getCategory(categoryId.value).products)
const brands = computed(() => getProduct(categoryId.value, productId.value).brands)
const emptyText = computed(() =>
  loading.value ? '正在查找…' : '暂无结果。请选择品类与品牌后点击开始查找。'
)

function onCategoryChange() {
  productId.value = products.value[0]?.id || ''
  onProductChange()
}

function onProductChange() {
  brand.value = ALL_BRAND_VALUE
}

onMounted(() => {
  materials.load().catch(() => {})
  purgeSearchCache().catch(() => {})
})

function cacheHits(list) {
  cacheSearchResults(list).catch(() => {})
}

function itemKey(item) {
  return item?.pageUrl || item?.url || item?.thumb || item?.title || ''
}

async function saveToMaterials(item) {
  if (!item) return
  savingKey.value = itemKey(item)
  try {
    const result = await materials.addFromSearch(item, {
      categoryId: categoryId.value,
      productId: productId.value,
      brand: brand.value,
      extra: extra.value
    })
    if (result.duplicated) ElMessage.info('该图片已在素材库中')
    else ElMessage.success('已保存到素材库')
  } catch (error) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    savingKey.value = ''
  }
}

function openPreview(item) {
  if (!item) return
  previewItem.value = item
  previewOpen.value = true
}

function downloadItem(item) {
  const href = item.svg ? svgToDataUrl(item.svg) : item.url || item.thumb
  if (!href) {
    ElMessage.warning('当前条目没有可下载文件')
    return
  }
  const a = document.createElement('a')
  a.href = href
  a.download = `${item.title || 'pcb-icon'}${item.svg ? '.svg' : ''}`
  a.target = '_blank'
  a.rel = 'noopener'
  a.click()
}

async function ensureModelKey() {
  if (settings.currentKey) return true
  await ElMessageBox.alert('模型检索/生成需要先配置当前大模型 API Key', '无法使用模型', {
    confirmButtonText: '去配置',
    type: 'warning'
  })
  router.push('/settings')
  return false
}

async function runSearch() {
  loading.value = true
  results.value = []
  statusText.value = '正在按合法开源规则查找…'
  try {
    const category = getCategory(categoryId.value)
    const product = getProduct(categoryId.value, productId.value)
    if (engine.value === 'crawler') {
      const list = await searchLegalBoardImages({
        categoryId: categoryId.value,
        productId: productId.value,
        brand: brand.value,
        extra: extra.value
      })
      results.value = list
      cacheHits(list)
      statusText.value = list.length
        ? `全网检索返回 ${list.length} 条（已过滤违规词）`
        : '未找到公开图片，可改用模型生成教学图标'
      return
    }

    if (!(await ensureModelKey())) return
    const planned = await planOrGenerateBoardIcon({
      providerId: settings.currentProvider,
      apiKey: settings.currentKey,
      mode: modelAction.value,
      categoryName: category.name,
      productName: product.name,
      brand: brand.value,
      extra: extra.value
    })

    if (modelAction.value === 'generate' || planned.mode === 'generate') {
      const svg = sanitizeSvg(planned.svg)
      results.value = [
        {
          id: 'gen-svg',
          source: `模型生成 · ${providerName.value}`,
          title: planned.title || `${product.name}教学电路图标`,
          creator: '本机模型原创',
          license: '原创教学图（非原厂资料）',
          svg,
          thumb: svgToDataUrl(svg)
        }
      ]
      cacheHits(results.value)
      statusText.value = planned.summary || '已生成原创教学图标'
      return
    }

    const list = await searchLegalBoardImages({
      categoryId: categoryId.value,
      productId: productId.value,
      brand: brand.value,
      extra: extra.value,
      extraQueries: planned.queries || []
    })
    results.value = list
    cacheHits(list)
    statusText.value = list.length
      ? `模型关键词 + 全网检索 ${list.length} 条`
      : '模型给出的关键词未检索到图片，可改为生成教学图标'
  } catch (error) {
    ElMessage.error(error.message || '查找失败')
    statusText.value = error.message || '查找失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.result-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.icon-card {
  background: #10182a;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
}

.icon-thumb {
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: #0b1220;
  margin-bottom: 10px;
  cursor: pointer;
}

.icon-thumb:hover {
  outline: 1px solid var(--accent);
}

.icon-thumb img,
.svg-box {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.svg-box :deep(svg) {
  width: 100%;
  height: 100%;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.icon-preview-stage {
  min-height: 420px;
  max-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1220;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: auto;
  padding: 16px;
}

.icon-preview-stage img,
.icon-preview-stage .svg-box {
  width: 100%;
  height: auto;
  max-height: 66vh;
  object-fit: contain;
}

.icon-preview-stage :deep(svg) {
  width: 100%;
  height: auto;
  max-height: 66vh;
}
</style>
