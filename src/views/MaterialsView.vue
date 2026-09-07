<template>
  <div>
    <h2 class="page-title">素材库</h2>
    <p class="page-desc">
      保存查找结果中的电路板图片，可按与查找模块相同的品类、产品、品牌筛选和改分类。图片会写入本机 materials 文件夹。
    </p>
    <p v-if="materials.folderPath" class="page-desc" style="margin-top: -8px">
      保存位置：{{ materials.folderPath }}
      <el-button v-if="canOpenFolder" link type="primary" @click="openFolder">打开文件夹</el-button>
    </p>

    <section class="panel">
      <el-form label-width="120px">
        <el-form-item label="常用品类">
          <el-select v-model="categoryId" style="width: 240px" placeholder="全部品类" clearable @change="onCategoryChange">
            <el-option label="全部品类" value="" />
            <el-option v-for="item in CATEGORIES" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="家电 / 产品">
          <el-select v-model="productId" style="width: 240px" placeholder="全部产品" clearable @change="onProductChange">
            <el-option label="全部产品" value="" />
            <el-option v-for="item in products" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="常用品牌">
          <el-select v-model="brand" style="width: 240px" placeholder="全部品牌" clearable>
            <el-option label="全部品牌" value="" />
            <el-option v-for="item in brands" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="关键词">
          <el-input v-model="keyword" style="max-width: 420px" placeholder="标题、备注、来源" clearable />
        </el-form-item>
      </el-form>
    </section>

    <section class="panel" style="margin-top: 16px">
      <div class="toolbar" style="margin-top: 0">
        <h3 style="margin: 0">素材库</h3>
        <span class="page-desc" style="margin: 0">共 {{ filtered.length }} / {{ materials.items.length }} 条</span>
      </div>
      <div v-if="filtered.length" class="result-cards">
        <article v-for="item in filtered" :key="item.id" class="icon-card">
          <div class="thumb-row">
            <div v-for="slot in previewSlots" :key="slot.key" class="slot-cell">
              <button
                type="button"
                class="slot-thumb"
                :class="{ empty: !item[slot.key] }"
                :title="item[slot.key] ? `查看${slot.label}` : `未保存${slot.label}`"
                :disabled="!item[slot.key]"
                @click="openSlot(item, slot.key)"
              >
                <img v-if="item[slot.key]" :src="item[slot.key]" :alt="slot.label" />
                <span v-else>无</span>
              </button>
              <span class="slot-caption" :class="item[slot.key] ? 'on' : 'off'">{{ slot.label }}</span>
            </div>
          </div>
          <strong>{{ item.title }}</strong>
          <p class="page-desc" style="margin: 4px 0 0">ID {{ item.id }}</p>
          <p class="slot-flags">
            <span :class="item.front ? 'on' : 'off'">正面</span>
            <span class="sep">/</span>
            <span :class="item.back ? 'on' : 'off'">反面</span>
            <span class="sep">/</span>
            <span :class="item.schematic ? 'on' : 'off'">原理图</span>
          </p>
          <p class="page-desc" style="margin: 4px 0 6px">
            {{ labelOf(item) }}{{ item.note ? ` · ${item.note}` : '' }}
          </p>
          <div class="card-actions">
            <el-button size="small" @click="openEdit(item)">编辑分类</el-button>
            <el-button size="small" type="primary" @click="goToRepair(item)">维修识别</el-button>
            <el-button size="small" type="danger" text @click="removeItem(item)">删除</el-button>
          </div>
        </article>
      </div>
      <p v-else class="page-desc">暂无匹配项。请先在「查找」结果中点击「保存到素材库」。</p>
    </section>

    <el-dialog
      v-model="slotOpen"
      :title="slotTitle"
      width="560px"
      append-to-body
      destroy-on-close
    >
      <p class="page-desc">点击图片可放大预览。选择正面 / 反面 / 原理图后保存。</p>
      <div v-if="slotSrc" class="slot-dialog-stage" title="点击预览大图" @click="lightboxOpen = true">
        <img :src="slotSrc" alt="素材库图片" />
      </div>
      <el-radio-group v-model="slotKind" class="slot-kind-group">
        <el-radio-button v-for="slot in previewSlots" :key="slot.key" :value="slot.key" :label="slot.key">
          {{ slot.label }}
        </el-radio-button>
      </el-radio-group>
      <template #footer>
        <el-button @click="slotOpen = false">取消</el-button>
        <el-button type="primary" :loading="slotSaving" @click="saveSlotKind">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="lightboxOpen" title="图片预览" width="90%" append-to-body destroy-on-close class="lightbox-dialog">
      <img v-if="slotSrc" class="lightbox-img" :src="slotSrc" alt="预览" />
    </el-dialog>

    <el-dialog v-model="editOpen" title="编辑分类" width="520px" append-to-body>
      <el-form v-if="draft" label-width="100px">
        <el-form-item label="标题">
          <el-input v-model="draft.title" />
        </el-form-item>
        <el-form-item label="品类">
          <el-select v-model="draft.categoryId" style="width: 100%" @change="onDraftCategoryChange">
            <el-option v-for="item in CATEGORIES" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品">
          <el-select v-model="draft.productId" style="width: 100%" @change="onDraftProductChange">
            <el-option v-for="item in draftProducts" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="品牌">
          <el-select v-model="draft.brand" style="width: 100%">
            <el-option label="不限定品牌" :value="ALL_BRAND_VALUE" />
            <el-option v-for="item in draftBrands" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="draft.note" type="textarea" :rows="2" placeholder="维修备注，选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMaterialsStore } from '@/stores/materials'
import { openMaterialsFolder } from '@/utils/materialFolder'
import {
  ALL_BRAND_VALUE,
  CATEGORIES,
  getCategory,
  getProduct
} from '@/data/pcbIconCatalog'

const materials = useMaterialsStore()
const router = useRouter()
const categoryId = ref('')
const productId = ref('')
const brand = ref('')
const keyword = ref('')
const previewSlots = [
  { key: 'front', label: '正面' },
  { key: 'back', label: '反面' },
  { key: 'schematic', label: '原理图' }
]
const slotOpen = ref(false)
const lightboxOpen = ref(false)
const slotItemId = ref('')
const slotFromKey = ref('front')
const slotKind = ref('front')
const slotSrc = ref('')
const slotSaving = ref(false)
const editOpen = ref(false)
const draft = ref(null)
const canOpenFolder = Boolean(window.electronAPI?.materialsOpen)
const slotTitle = computed(() => {
  const item = materials.items.find((row) => row.id === slotItemId.value)
  const label = previewSlots.find((slot) => slot.key === slotFromKey.value)?.label || '图片'
  return item ? `${item.title} · ${label}` : '图片分类'
})

const products = computed(() => (categoryId.value ? getCategory(categoryId.value).products : []))
const brands = computed(() =>
  categoryId.value && productId.value ? getProduct(categoryId.value, productId.value).brands : []
)
const draftProducts = computed(() => (draft.value ? getCategory(draft.value.categoryId).products : []))
const draftBrands = computed(() =>
  draft.value ? getProduct(draft.value.categoryId, draft.value.productId).brands : []
)

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  return materials.items.filter((item) => {
    if (categoryId.value && item.categoryId !== categoryId.value) return false
    if (productId.value && item.productId !== productId.value) return false
    if (brand.value && item.brand !== brand.value && item.brand !== ALL_BRAND_VALUE) return false
    if (!q) return true
    return `${item.title} ${item.note} ${item.source} ${item.creator}`.toLowerCase().includes(q)
  })
})

onMounted(() => {
  materials.load().catch(() => ElMessage.error('本地素材库读取失败'))
})

async function openFolder() {
  try {
    const result = await openMaterialsFolder()
    if (result?.error) ElMessage.warning(result.error)
  } catch (error) {
    ElMessage.info(error.message || '请在资源管理器中打开项目下的 materials 文件夹')
  }
}

function onCategoryChange() {
  productId.value = ''
  brand.value = ''
}

function onProductChange() {
  brand.value = ''
}

function onDraftCategoryChange() {
  draft.value.productId = getCategory(draft.value.categoryId).products[0]?.id || ''
  onDraftProductChange()
}

function onDraftProductChange() {
  draft.value.brand = ALL_BRAND_VALUE
}

function labelOf(item) {
  const category = CATEGORIES.find((row) => row.id === item.categoryId)
  const product = category?.products.find((row) => row.id === item.productId)
  const brandText = item.brand && item.brand !== ALL_BRAND_VALUE ? item.brand : '不限定品牌'
  return [category?.name, product?.name, brandText].filter(Boolean).join(' / ')
}

function openSlot(item, key) {
  if (!item?.[key]) return
  slotItemId.value = item.id
  slotFromKey.value = key
  slotKind.value = key
  slotSrc.value = item[key]
  lightboxOpen.value = false
  slotOpen.value = true
}

async function saveSlotKind() {
  if (!slotItemId.value || slotKind.value === slotFromKey.value) {
    slotOpen.value = false
    return
  }
  slotSaving.value = true
  try {
    await materials.moveImageSlot(slotItemId.value, slotFromKey.value, slotKind.value)
    slotFromKey.value = slotKind.value
    const item = materials.items.find((row) => row.id === slotItemId.value)
    slotSrc.value = item?.[slotKind.value] || slotSrc.value
    ElMessage.success('已更新图片类型')
    slotOpen.value = false
  } catch (error) {
    ElMessage.error(error.message || '更新失败')
  } finally {
    slotSaving.value = false
  }
}

function goToRepair(item) {
  if (!item?.front && !item?.back && !item?.schematic) {
    ElMessage.warning('该条目没有可识别的图片')
    return
  }
  router.push({ name: 'repair', query: { material: item.id } })
}

function openEdit(item) {
  draft.value = { ...item }
  editOpen.value = true
}

async function saveEdit() {
  await materials.update(draft.value)
  editOpen.value = false
  ElMessage.success('分类已更新')
}

async function removeItem(item) {
  await ElMessageBox.confirm(`删除「${item.title}」？`, '删除确认', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
  await materials.remove(item.id)
  ElMessage.success('已删除')
}
</script>

<style scoped>
.result-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}

.icon-card {
  background: #10182a;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
}

.thumb-row {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  width: 100%;
}

.slot-cell {
  flex: 1 1 0;
  min-width: 0;
  text-align: center;
}

.slot-caption {
  display: block;
  margin-top: 4px;
  font-size: 12px;
}

.slot-thumb {
  width: 100%;
  height: 86px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: #0b1220;
  border: 1px solid var(--line);
  cursor: pointer;
  padding: 0;
  color: var(--muted);
  font-size: 12px;
}

.slot-thumb:hover:not(:disabled) {
  outline: 1px solid var(--accent);
}

.slot-thumb:disabled,
.slot-thumb.empty {
  cursor: default;
  opacity: 0.55;
}

.slot-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.slot-dialog-stage {
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1220;
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: zoom-in;
  margin-bottom: 16px;
}

.slot-dialog-stage img,
.lightbox-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.lightbox-img {
  width: 100%;
  max-height: 80vh;
  display: block;
  margin: 0 auto;
}

.slot-kind-group {
  display: flex;
  justify-content: center;
  width: 100%;
}

.svg-box :deep(svg),
.icon-preview-stage :deep(svg) {
  width: 100%;
  height: 100%;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.icon-card strong {
  display: block;
}

.slot-flags {
  margin: 8px 0 0;
  font-size: 13px;
}

.slot-flags .on,
.slot-caption.on,
.preview-slot .on {
  color: var(--text);
  font-weight: 600;
}

.slot-flags .off,
.slot-caption.off,
.preview-slot .off {
  color: var(--muted);
  opacity: 0.5;
}

.slot-flags .sep {
  color: var(--muted);
  margin: 0 2px;
}

</style>
