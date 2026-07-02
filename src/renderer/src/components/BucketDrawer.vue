<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NIcon,
  NInput,
  NPopconfirm,
  useMessage,
} from 'naive-ui'
import {
  AddOutline,
  CloseOutline,
  CreateOutline,
  RefreshOutline,
  CheckmarkOutline,
  CubeOutline,
  ArrowBackOutline,
  ChevronForwardOutline,
  CopyOutline,
  CheckmarkDoneOutline,
} from '@vicons/ionicons5'

interface BucketItem {
  id: string
  name: string
  url: string
  status: 'success' | 'warning'
  appCount: number
  lastUpdated: string
}

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  add: [name: string, url: string]
  remove: [name: string]
  sync: [name: string]
  'update-bucket': [id: string, name: string, url: string]
}>()

const message = useMessage()
const loading = ref(false)
const addModal = ref(false)
const newName = ref('')
const newUrl = ref('')
const copied = ref(false)
const syncing = ref(false)

const currentView = ref<'list' | 'detail'>('list')
const selectedBucket = ref<BucketItem | null>(null)
const detailMode = ref<'view' | 'edit'>('view')
const editForm = ref<{ name: string; url: string }>({ name: '', url: '' })

const buckets = ref<BucketItem[]>([])

/** 只有 main 源不允许编辑 */
const isMain = computed(() => selectedBucket.value?.name.toLowerCase() === 'main')

function statusColor(s: string): string {
  switch (s) {
    case 'success': return 'bg-emerald-500'
    case 'warning': return 'bg-amber-500'
    default: return 'bg-gray-500'
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'success': return '正常'
    case 'warning': return '待更新'
    default: return '未知'
  }
}

function openDetail(b: BucketItem) {
  selectedBucket.value = b
  detailMode.value = 'view'
  currentView.value = 'detail'
}

function goBack() {
  currentView.value = 'list'
  selectedBucket.value = null
  detailMode.value = 'view'
}

function startEdit() {
  if (!selectedBucket.value || isMain.value) return
  editForm.value = {
    name: selectedBucket.value.name,
    url: selectedBucket.value.url,
  }
  detailMode.value = 'edit'
}

function cancelEdit() {
  detailMode.value = 'view'
}

function saveEdit() {
  const b = selectedBucket.value
  if (!b || isMain.value) return
  const orig = buckets.value.find(x => x.id === b.id)
  if (!orig) return
  if (orig.name !== editForm.value.name || orig.url !== editForm.value.url) {
    orig.name = editForm.value.name
    orig.url = editForm.value.url
    emit('update-bucket', orig.id, orig.name, orig.url)
    message.success(`Bucket「${orig.name}」已更新`)
  }
  selectedBucket.value = orig
  detailMode.value = 'view'
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    copied.value = true
    message.success('链接已复制到剪贴板')
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    message.error('复制失败')
  }
}

async function handleSyncAndRefresh(name: string) {
  syncing.value = true
  try {
    await window.scoopAPI.addBucket(name)
    await fetchBuckets()
    message.success(`Bucket「${name}」同步完成`)
  } catch (e: any) {
    message.error('同步失败: ' + (e.message || e))
  } finally {
    syncing.value = false
  }
}

/**
 * 解析 Scoop Bucket 原始文本列表
 */
function parseScoopBuckets(rawText: string): BucketItem[] {
  if (!rawText || typeof rawText !== 'string') return []

  return rawText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, index) => {
      const parts = line.split(/\s{2,}/)
      if (parts.length < 2) return null

      const name = parts[0]
      const url = parts[1]
      const lastUpdated = parts[2] ? parts[2].replace(/\s+/g, ' ') : ''
      let appCount = 0
      if (parts[3]) {
        appCount = parseInt(parts[3], 10) || 0
      }

      return {
        id: `${name}-${index}`,
        name,
        url,
        status: 'success' as const,
        appCount,
        localPath: '',
        lastUpdated,
      }
    })
    .filter((item): item is BucketItem => item !== null)
}

async function fetchBuckets() {
  loading.value = true
  try {
    const data = await window.scoopAPI.listBuckets()
    buckets.value = (data as any[]).map((b: any, i: number) => ({
      id: `${b.name}-${i}`,
      name: b.name,
      url: b.source,
      status: 'success' as const,
      appCount: b.appCount || 0,
      lastUpdated: b.lastUpdated || '',
    }))
    // 同步更新详情卡片数据
    if (selectedBucket.value) {
      const updated = buckets.value.find(b => b.name === selectedBucket.value!.name)
      if (updated) {
        selectedBucket.value = updated
      }
    }
  } catch (e: any) {
    message.error('获取软件源列表失败: ' + (e.message || e))
  } finally {
    loading.value = false
  }
}

async function handleRemove(name: string) {
  try {
    await window.scoopAPI.removeBucket(name)
    buckets.value = buckets.value.filter(b => b.name !== name)
    if (selectedBucket.value?.name === name) {
      goBack()
    }
    emit('remove', name)
    message.success(`Bucket「${name}」已移除`)
  } catch (e: any) {
    message.error('移除失败: ' + (e.message || e))
  }
}

async function handleAdd() {
  if (!newName.value.trim()) return
  const exists = buckets.value.some(b => b.name === newName.value.trim())
  if (exists) {
    message.warning('Bucket 名称已存在')
    return
  }
  try {
    await window.scoopAPI.addBucket(newName.value.trim(), newUrl.value.trim() || undefined)
    message.success(`Bucket「${newName.value.trim()}」已添加`)
    newName.value = ''
    newUrl.value = ''
    addModal.value = false
    await fetchBuckets()
  } catch (e: any) {
    message.error('添加失败: ' + (e.message || e))
  }
}

onMounted(() => {
  fetchBuckets()
})
</script>

<template>
  <NDrawer
    v-model:show="props.show"
    :width="480"
    placement="right"
    @update:show="v => emit('update:show', v)"
  >
    <NDrawerContent closable content-class="!p-0 flex flex-col h-full overflow-hidden">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="text-base font-semibold text-white/90">软件源管理</span>
          <span class="px-1.5 py-0.5 text-[11px] bg-white/[0.06] text-gray-400 rounded font-mono leading-none">Bucket</span>
        </div>
      </template>

      <div class="flex-1 overflow-hidden">
        <!-- ═══ VIEW A: LIST ═══ -->
        <Transition name="view-slide-left" mode="out-in">
          <div v-if="currentView === 'list'" key="list" class="h-full flex flex-col overflow-hidden">
            <div class="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
              <span class="text-sm text-gray-500">已添加 {{ buckets.length }} 个源</span>
              <NButton size="tiny" secondary @click="addModal = true" class="!rounded-md">
                <template #icon><NIcon :component="AddOutline" size="14" /></template>
                添加源
              </NButton>
            </div>

            <div v-if="loading" class="flex justify-center py-12">
              <div class="flex flex-col items-center gap-3">
                <div class="w-5 h-5 border-2 border-t-transparent border-indigo-400 rounded-full animate-spin" />
                <span class="text-xs text-gray-400">加载中...</span>
              </div>
            </div>

            <div v-else-if="buckets.length === 0" class="flex flex-col items-center py-16 text-gray-500">
              <NIcon :component="CubeOutline" size="40" class="opacity-30 mb-3" />
              <p class="text-sm">暂无软件源</p>
              <p class="text-xs text-gray-600 mt-1">点击上方按钮添加第一个 Bucket</p>
            </div>

            <div v-else class="flex-1 overflow-y-auto custom-scrollbar">
              <div
                v-for="b in buckets"
                :key="b.id"
                class="group flex items-center h-[52px] px-4 transition-all duration-150 border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.03]"
                @click="openDetail(b)"
              >
                <span class="w-2 h-2 rounded-full flex-shrink-0 mr-3" :class="statusColor(b.status)" />
                <span class="font-medium text-[15px] text-white/90 truncate max-w-[160px] flex-shrink-0">{{ b.name }}</span>
                <span class="ml-3 text-slate-500 text-xs truncate min-w-0 flex-1 hidden sm:block font-mono">{{ b.url }}</span>
                <div class="ml-auto pl-2 flex items-center gap-1 flex-shrink-0">
                  <NIcon
                    :component="ChevronForwardOutline"
                    size="16"
                    class="text-gray-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200"
                  />
                  <NPopconfirm @positive-click.stop="handleRemove(b.name)">
                    <template #trigger>
                      <NButton
                        text size="small"
                        class="!w-6 !h-6 !text-gray-500 hover:!text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        @click.stop
                      >
                        <template #icon><NIcon :component="CloseOutline" size="13" /></template>
                      </NButton>
                    </template>
                    确认移除 <span class="font-medium text-white/90">{{ b.name }}</span>？
                  </NPopconfirm>
                </div>
              </div>
            </div>
          </div>

          <!-- ═══ VIEW B: DETAIL / EDIT (full width) ═══ -->
          <div v-else key="detail" class="h-full flex flex-col overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04] flex-shrink-0">
              <button
                class="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
                @click="goBack"
              >
                <NIcon :component="ArrowBackOutline" size="16" />
                返回
              </button>
              <span class="text-sm text-gray-600">/</span>
              <span class="text-sm font-medium text-white/80 truncate">{{ selectedBucket?.name }}</span>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar">
              <template v-if="selectedBucket">
                <Transition name="detail-fade" mode="out-in">
                  <!-- VIEW MODE -->
                  <div v-if="detailMode === 'view'" key="view" class="h-full flex flex-col">
                    <!-- Top: scrollable content -->
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
                      <!-- Header: name + status -->
                      <div class="flex items-center gap-3">
                        <span class="w-3 h-3 rounded-full flex-shrink-0" :class="statusColor(selectedBucket.status)" />
                        <h2 class="text-xl font-bold text-white tracking-tight">{{ selectedBucket.name }}</h2>
                        <span class="text-[11px] text-gray-500 ml-auto">{{ statusLabel(selectedBucket.status) }}</span>
                      </div>

                      <!-- URL (read-only) -->
                      <div class="space-y-2">
                        <label class="text-xs text-gray-500 block">软件源地址</label>
                        <div class="relative group">
                          <div class="bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 pr-12 text-[13px] font-mono text-gray-300 leading-relaxed break-all select-all whitespace-pre-wrap">{{ selectedBucket.url }}</div>
                          <button
                            class="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200"
                            :class="copied
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : 'text-gray-500 hover:text-cyan-400 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100'"
                            title="复制链接"
                            @click="copyUrl(selectedBucket.url)"
                          >
                            <NIcon :component="copied ? CheckmarkDoneOutline : CopyOutline" size="15" />
                          </button>
                        </div>
                      </div>

                      <!-- Metadata card group -->
                      <div class="bg-white/[0.03] border border-white/[0.05] rounded-lg divide-y divide-white/[0.05]">
                        <div class="flex items-center px-4 py-3 gap-4">
                          <span class="text-xs text-gray-500 w-16 flex-shrink-0">Manifests</span>
                          <span class="text-xs text-gray-300 font-mono">{{ selectedBucket.appCount.toLocaleString() }} 个</span>
                        </div>
                        <div class="flex items-center px-4 py-3 gap-4">
                          <span class="text-xs text-gray-500 w-16 flex-shrink-0">上次同步</span>
                          <span class="text-xs text-gray-400">{{ selectedBucket.lastUpdated || '—' }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Bottom: sticky action button group -->
                    <div class="flex-shrink-0 px-5 pt-4 pb-5 border-t border-white/[0.08]">
                      <div class="flex gap-3">
                        <NButton size="medium" secondary class="flex-1 !rounded-lg" :disabled="isMain" @click="startEdit">
                          <template #icon><NIcon :component="CreateOutline" size="16" /></template>
                          编辑配置
                        </NButton>
                        <NButton
                          size="medium" secondary class="flex-1 !rounded-lg"
                          :loading="syncing"
                          @click="handleSyncAndRefresh(selectedBucket.name)"
                        >
                          <template #icon><NIcon :component="RefreshOutline" size="16" /></template>
                          强制同步
                        </NButton>
                      </div>
                    </div>
                  </div>

                  <!-- EDIT MODE -->
                  <div v-else key="edit" class="p-6 flex flex-col gap-5">
                    <div>
                      <label class="text-xs text-gray-500 mb-1.5 block">Bucket 名称</label>
                      <NInput
                        v-model:value="editForm.name"
                        size="small"
                        placeholder="Bucket 名称"
                        :disabled="isMain"
                      />
                    </div>
                    <div>
                      <label class="text-xs text-gray-500 mb-1.5 block">远程仓库地址</label>
                      <NInput
                        v-model:value="editForm.url"
                        type="textarea"
                        :autosize="{ minRows: 3, maxRows: 8 }"
                        placeholder="https://github.com/..."
                        :disabled="isMain"
                        class="font-mono text-sm"
                      />
                      <p v-if="isMain" class="text-[11px] text-amber-500/70 mt-2">
                        main 源为系统核心源，不允许修改
                      </p>
                    </div>
                    <div class="flex gap-2 pt-2">
                      <NButton size="small" type="primary" class="flex-1 !rounded-lg !h-9" :disabled="isMain" @click="saveEdit">
                        <template #icon><NIcon :component="CheckmarkOutline" size="15" /></template>
                        保存修改
                      </NButton>
                      <NButton size="small" secondary class="flex-1 !rounded-lg !h-9" @click="cancelEdit">
                        取消
                      </NButton>
                    </div>
                  </div>
                </Transition>
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </NDrawerContent>
  </NDrawer>

  <NModal v-model:show="addModal" preset="card" title="添加软件源" style="width: 420px" :mask-closable="true">
    <div class="flex flex-col gap-4">
      <div>
        <label class="text-xs text-gray-500 mb-1.5 block">Bucket 名称</label>
        <NInput v-model:value="newName" placeholder="如 extras" size="small" />
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1.5 block">Git 仓库链接（可选）</label>
        <NInput v-model:value="newUrl" placeholder="https://github.com/..." size="small" />
      </div>
      <NButton type="primary" size="small" :disabled="!newName.trim()" @click="handleAdd" class="!mt-1" block>添加</NButton>
    </div>
  </NModal>
</template>

<style scoped>
.view-slide-enter-active,
.view-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.view-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.view-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.detail-fade-enter-active,
.detail-fade-leave-active {
  transition: opacity 0.15s ease;
}
.detail-fade-enter-from,
.detail-fade-leave-to {
  opacity: 0;
}
</style>
