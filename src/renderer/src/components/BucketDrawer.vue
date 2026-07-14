<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NIcon,
  NInput,
  NPopconfirm,
  NModal,
  useMessage,
} from 'naive-ui'
import {
  AddOutline,
  CreateOutline,
  RefreshOutline,
  CheckmarkOutline,
  CubeOutline,
  ArrowBackOutline,
  ChevronForwardOutline,
  CopyOutline,
  CheckmarkDoneOutline,
  OpenOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { APP_DRAWER_WIDTH } from '@/constants/layout'

interface BucketItem {
  id: string
  name: string
  url: string
  status: 'success' | 'warning'
  appCount: number
  lastUpdated: string
  localPath: string
  branch: string
  commit: string
  localExists: boolean
  warning?: string
}

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  add: [name: string, url: string]
  remove: [name: string]
  sync: [name: string]
}>()

const message = useMessage()
const loading = ref(false)
const addModal = ref(false)
const newName = ref('')
const newUrl = ref('')
const copiedKey = ref('')
const syncingName = ref('')
const removingName = ref('')
const savingSource = ref(false)

const currentView = ref<'list' | 'detail'>('list')
const selectedBucket = ref<BucketItem | null>(null)
const detailMode = ref<'view' | 'edit'>('view')
const editForm = ref<{ url: string }>({ url: '' })

const buckets = ref<BucketItem[]>([])

const isMain = computed(() => selectedBucket.value?.name.toLowerCase() === 'main')
const canModifySource = computed(() => !!selectedBucket.value && !isMain.value && selectedBucket.value.localExists)
const addDialogStyle = computed(() => ({ width: `${APP_DRAWER_WIDTH}px` }))

function statusColor(s: string): string {
  return s === 'success' ? 'bg-emerald-500' : 'bg-amber-500'
}

function statusLabel(s: string): string {
  return s === 'success' ? '正常' : '待检查'
}

function normalizeBucket(raw: any, index: number): BucketItem {
  const warning = raw.warning || (!raw.localExists ? '本地 bucket 目录不存在' : '')
  return {
    id: raw.name || `bucket-${index}`,
    name: raw.name || 'unknown',
    url: raw.source || '',
    status: warning ? 'warning' : 'success',
    appCount: Number(raw.appCount || 0),
    lastUpdated: raw.lastUpdated || '',
    localPath: raw.localPath || '',
    branch: raw.branch || '',
    commit: raw.commit || '',
    localExists: raw.localExists !== false,
    warning,
  }
}

function openDetail(bucket: BucketItem) {
  selectedBucket.value = bucket
  detailMode.value = 'view'
  currentView.value = 'detail'
}

function goBack() {
  currentView.value = 'list'
  selectedBucket.value = null
  detailMode.value = 'view'
}

function startEdit() {
  if (!selectedBucket.value || !canModifySource.value) return
  editForm.value = { url: selectedBucket.value.url }
  detailMode.value = 'edit'
}

function cancelEdit() {
  detailMode.value = 'view'
}

async function copyValue(key: string, value: string, label = '内容') {
  if (!value) {
    message.warning(`${label}为空，暂不可复制`)
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    copiedKey.value = key
    message.success(`${label}已复制`)
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = ''
    }, 1500)
  } catch {
    message.error('复制失败')
  }
}

async function openLocalPath(path: string) {
  if (!path) {
    message.warning('本地路径为空')
    return
  }
  try {
    await window.scoopAPI.openPath(path)
  } catch (e: any) {
    message.error('打开目录失败: ' + (e.message || e))
  }
}

async function saveEdit() {
  const bucket = selectedBucket.value
  const url = editForm.value.url.trim()
  if (!bucket || !canModifySource.value) return
  if (!url) {
    message.warning('远程仓库地址不能为空')
    return
  }
  if (url === bucket.url) {
    detailMode.value = 'view'
    return
  }

  savingSource.value = true
  try {
    await window.scoopAPI.updateBucketSource(bucket.name, url)
    message.success(`Bucket「${bucket.name}」远程地址已更新`)
    detailMode.value = 'view'
    await fetchBuckets()
  } catch (e: any) {
    message.error('保存失败: ' + (e.message || e))
  } finally {
    savingSource.value = false
  }
}

async function handleSyncAndRefresh(name: string) {
  if (syncingName.value) return
  syncingName.value = name
  try {
    const result = await window.scoopAPI.syncBucket(name)
    await fetchBuckets()
    emit('sync', name)
    message.success(result?.message || `Bucket「${name}」同步完成`)
  } catch (e: any) {
    message.error('同步失败: ' + (e.message || e))
  } finally {
    syncingName.value = ''
  }
}

async function fetchBuckets() {
  loading.value = true
  const selectedName = selectedBucket.value?.name
  try {
    const data = await window.scoopAPI.listBuckets()
    buckets.value = (data as any[]).map(normalizeBucket)
    if (selectedName) {
      const updated = buckets.value.find(bucket => bucket.name === selectedName)
      if (updated) selectedBucket.value = updated
    }
  } catch (e: any) {
    message.error('获取软件源列表失败: ' + (e.message || e))
  } finally {
    loading.value = false
  }
}

async function handleRemove(name: string) {
  if (name.toLowerCase() === 'main') {
    message.warning('main 是 Scoop 核心源，不建议移除')
    return
  }

  removingName.value = name
  try {
    await window.scoopAPI.removeBucket(name)
    buckets.value = buckets.value.filter(bucket => bucket.name !== name)
    if (selectedBucket.value?.name === name) goBack()
    emit('remove', name)
    message.success(`Bucket「${name}」已移除`)
  } catch (e: any) {
    message.error('移除失败: ' + (e.message || e))
  } finally {
    removingName.value = ''
  }
}

async function handleAdd() {
  const name = newName.value.trim()
  const repo = newUrl.value.trim()
  if (!name) return
  const exists = buckets.value.some(bucket => bucket.name.toLowerCase() === name.toLowerCase())
  if (exists) {
    message.warning('Bucket 名称已存在')
    return
  }

  try {
    await window.scoopAPI.addBucket(name, repo || undefined)
    message.success(`Bucket「${name}」已添加`)
    emit('add', name, repo)
    newName.value = ''
    newUrl.value = ''
    addModal.value = false
    currentView.value = 'list'
    await fetchBuckets()
  } catch (e: any) {
    message.error('添加失败: ' + (e.message || e))
  }
}

watch(() => props.show, (show) => {
  if (show) fetchBuckets()
})

onMounted(() => {
  if (props.show) fetchBuckets()
})
</script>

<template>
  <NDrawer
    :show="props.show"
    :width="APP_DRAWER_WIDTH"
    placement="right"
    @update:show="value => emit('update:show', value)"
  >
    <NDrawerContent closable content-class="!p-0 flex flex-col h-full overflow-hidden">
      <template #header>
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base font-semibold dark:text-white/90 text-gray-800">软件源管理</span>
          <span class="px-1.5 py-0.5 text-[11px] dark:bg-white/[0.06] bg-black/[0.04] dark:text-gray-400 text-gray-500 rounded leading-none">Bucket</span>
        </div>
      </template>

      <div class="flex-1 overflow-hidden">
        <Transition name="view-slide" mode="out-in">
          <div v-if="currentView === 'list'" key="list" class="h-full flex flex-col overflow-hidden">
            <div class="flex items-center justify-between gap-3 px-4 py-2.5 border-b dark:border-white/[0.04] border-black/[0.06] flex-shrink-0">
              <span class="text-sm text-gray-500">已添加 {{ buckets.length }} 个源</span>
              <div class="flex items-center gap-2">
                <NButton size="tiny" quaternary class="!rounded-md" :loading="loading" @click="fetchBuckets">
                  <template #icon><NIcon :component="RefreshOutline" size="14" /></template>
                  刷新
                </NButton>
                <NButton size="tiny" secondary class="!rounded-md" @click="addModal = true">
                  <template #icon><NIcon :component="AddOutline" size="14" /></template>
                  添加源
                </NButton>
              </div>
            </div>

            <div v-if="loading && buckets.length === 0" class="flex justify-center py-12">
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
                v-for="bucket in buckets"
                :key="bucket.id"
                class="group flex items-center h-[58px] px-4 transition-all duration-150 border-b dark:border-white/[0.04] border-black/[0.06] cursor-pointer dark:hover:bg-white/[0.03] hover:bg-black/[0.03]"
                @click="openDetail(bucket)"
              >
                <span class="w-2 h-2 rounded-full flex-shrink-0 mr-3" :class="statusColor(bucket.status)" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-semibold text-sm dark:text-white/90 text-gray-800 truncate">{{ bucket.name }}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] leading-none dark:bg-white/[0.05] bg-black/[0.04] dark:text-gray-400 text-gray-500">
                      {{ bucket.appCount.toLocaleString() }}
                    </span>
                  </div>
                  <p class="mt-1 text-xs dark:text-gray-500 text-gray-500 truncate">
                    {{ bucket.url || bucket.warning || '未读取到远程地址' }}
                  </p>
                </div>

                <div class="ml-3 flex items-center gap-1 flex-shrink-0">
                  <NButton
                    text
                    size="small"
                    class="!w-7 !h-7 !text-gray-500 hover:!text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    :loading="syncingName === bucket.name"
                    title="同步软件源"
                    @click.stop="handleSyncAndRefresh(bucket.name)"
                  >
                    <template #icon><NIcon :component="RefreshOutline" size="14" /></template>
                  </NButton>
                  <NPopconfirm v-if="bucket.name.toLowerCase() !== 'main'" @positive-click="handleRemove(bucket.name)">
                    <template #trigger>
                      <NButton
                        text
                        size="small"
                        class="!w-7 !h-7 !text-gray-500 hover:!text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        :loading="removingName === bucket.name"
                        title="移除软件源"
                        @click.stop
                      >
                        <template #icon><NIcon :component="TrashOutline" size="14" /></template>
                      </NButton>
                    </template>
                    确认移除 <span class="font-medium dark:text-white/90 text-gray-800">{{ bucket.name }}</span>？
                  </NPopconfirm>
                  <NIcon
                    :component="ChevronForwardOutline"
                    size="16"
                    class="text-gray-500 transition-all duration-200 group-hover:translate-x-0.5"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-else key="detail" class="h-full flex flex-col overflow-hidden">
            <div class="flex items-center gap-2 px-4 py-2.5 border-b dark:border-white/[0.04] border-black/[0.06] flex-shrink-0">
              <button
                class="flex items-center gap-1 text-sm dark:text-gray-400 text-gray-500 dark:hover:text-white hover:text-gray-800 transition-colors"
                @click="goBack"
              >
                <NIcon :component="ArrowBackOutline" size="16" />
                返回
              </button>
              <span class="text-sm text-gray-600">/</span>
              <span class="text-sm font-medium dark:text-white/80 text-gray-700 truncate">{{ selectedBucket?.name }}</span>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar">
              <template v-if="selectedBucket">
                <Transition name="detail-fade" mode="out-in">
                  <div v-if="detailMode === 'view'" key="view" class="h-full flex flex-col">
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
                      <div class="flex items-start gap-3">
                        <span class="w-3 h-3 rounded-full flex-shrink-0 mt-2" :class="statusColor(selectedBucket.status)" />
                        <div class="min-w-0 flex-1">
                          <h2 class="text-xl font-semibold dark:text-white text-gray-800 tracking-tight truncate">
                            {{ selectedBucket.name }}
                          </h2>
                          <div class="mt-2 flex flex-wrap items-center gap-2">
                            <span class="px-2 py-0.5 rounded text-[11px] dark:bg-white/[0.06] bg-black/[0.04] dark:text-gray-400 text-gray-500">
                              {{ statusLabel(selectedBucket.status) }}
                            </span>
                            <span v-if="selectedBucket.branch" class="px-2 py-0.5 rounded text-[11px] dark:bg-white/[0.06] bg-black/[0.04] dark:text-gray-400 text-gray-500">
                              {{ selectedBucket.branch }}
                            </span>
                            <span v-if="selectedBucket.commit" class="bucket-technical px-2 py-0.5 rounded text-[11px] dark:bg-white/[0.06] bg-black/[0.04] dark:text-gray-400 text-gray-500">
                              {{ selectedBucket.commit }}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        v-if="selectedBucket.warning"
                        class="px-4 py-3 rounded-lg border dark:border-amber-400/20 border-amber-500/20 dark:bg-amber-400/[0.07] bg-amber-50 text-xs dark:text-amber-200 text-amber-700"
                      >
                        {{ selectedBucket.warning }}
                      </div>

                      <div class="space-y-2">
                        <label class="text-xs text-gray-500 block">远程仓库地址</label>
                        <div class="relative group">
                          <div class="bucket-technical dark:bg-white/[0.03] bg-black/[0.02] border dark:border-white/[0.06] border-black/[0.08] rounded-lg px-4 py-3 pr-12 text-[13px] dark:text-gray-300 text-gray-700 leading-relaxed break-all select-all">
                            {{ selectedBucket.url || '未读取到远程仓库地址' }}
                          </div>
                          <button
                            class="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-md transition-all duration-200"
                            :class="copiedKey === 'url'
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : 'dark:text-gray-500 dark:hover:text-cyan-400 dark:hover:bg-white/[0.06] text-gray-500 hover:text-cyan-600 hover:bg-black/[0.04]'"
                            title="复制链接"
                            @click="copyValue('url', selectedBucket.url, '远程地址')"
                          >
                            <NIcon :component="copiedKey === 'url' ? CheckmarkDoneOutline : CopyOutline" size="15" />
                          </button>
                        </div>
                      </div>

                      <div class="dark:bg-white/[0.03] bg-black/[0.02] border dark:border-white/[0.05] border-black/[0.06] rounded-lg divide-y dark:divide-white/[0.05] divide-black/[0.06]">
                        <div class="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center px-4 py-3 gap-3">
                          <span class="text-xs text-gray-500">本地路径</span>
                          <span class="bucket-technical text-xs dark:text-gray-300 text-gray-700 truncate">{{ selectedBucket.localPath || '未定位' }}</span>
                          <div class="flex items-center gap-1">
                            <NButton text size="tiny" title="打开目录" @click="openLocalPath(selectedBucket.localPath)">
                              <template #icon><NIcon :component="OpenOutline" size="14" /></template>
                            </NButton>
                            <NButton text size="tiny" title="复制路径" @click="copyValue('path', selectedBucket.localPath, '本地路径')">
                              <template #icon><NIcon :component="copiedKey === 'path' ? CheckmarkDoneOutline : CopyOutline" size="14" /></template>
                            </NButton>
                          </div>
                        </div>
                        <div class="grid grid-cols-[88px_minmax(0,1fr)] items-center px-4 py-3 gap-3">
                          <span class="text-xs text-gray-500">Manifests</span>
                          <span class="text-xs dark:text-gray-300 text-gray-700">{{ selectedBucket.appCount.toLocaleString() }} 个</span>
                        </div>
                        <div class="grid grid-cols-[88px_minmax(0,1fr)] items-center px-4 py-3 gap-3">
                          <span class="text-xs text-gray-500">上次同步</span>
                          <span class="text-xs dark:text-gray-300 text-gray-700">{{ selectedBucket.lastUpdated || '未读取' }}</span>
                        </div>
                        <div class="grid grid-cols-[88px_minmax(0,1fr)] items-center px-4 py-3 gap-3">
                          <span class="text-xs text-gray-500">Git 分支</span>
                          <span class="bucket-technical text-xs dark:text-gray-300 text-gray-700">{{ selectedBucket.branch || '未读取' }}</span>
                        </div>
                      </div>
                    </div>

                    <div class="flex-shrink-0 px-5 pt-4 pb-5 border-t dark:border-white/[0.08] border-black/[0.06]">
                      <div class="grid grid-cols-3 gap-2">
                        <NButton size="medium" secondary class="!rounded-lg" :disabled="!canModifySource" @click="startEdit">
                          <template #icon><NIcon :component="CreateOutline" size="16" /></template>
                          编辑地址
                        </NButton>
                        <NButton
                          size="medium"
                          secondary
                          class="!rounded-lg"
                          :loading="syncingName === selectedBucket.name"
                          @click="handleSyncAndRefresh(selectedBucket.name)"
                        >
                          <template #icon><NIcon :component="RefreshOutline" size="16" /></template>
                          同步
                        </NButton>
                        <NPopconfirm v-if="selectedBucket.name.toLowerCase() !== 'main'" @positive-click="handleRemove(selectedBucket.name)">
                          <template #trigger>
                            <NButton size="medium" secondary type="error" class="!rounded-lg" :loading="removingName === selectedBucket.name">
                              <template #icon><NIcon :component="TrashOutline" size="16" /></template>
                              删除
                            </NButton>
                          </template>
                          确认移除 <span class="font-medium">{{ selectedBucket.name }}</span>？
                        </NPopconfirm>
                        <NButton v-else size="medium" secondary class="!rounded-lg" disabled>
                          <template #icon><NIcon :component="TrashOutline" size="16" /></template>
                          删除
                        </NButton>
                      </div>
                    </div>
                  </div>

                  <div v-else key="edit" class="p-6 flex flex-col gap-5">
                    <div>
                      <label class="text-xs text-gray-500 mb-1.5 block">Bucket 名称</label>
                      <div class="dark:bg-white/[0.03] bg-black/[0.02] border dark:border-white/[0.06] border-black/[0.08] rounded-lg px-3 py-2 text-sm dark:text-gray-300 text-gray-700">
                        {{ selectedBucket.name }}
                      </div>
                    </div>
                    <div>
                      <label class="text-xs text-gray-500 mb-1.5 block">远程仓库地址</label>
                      <NInput
                        v-model:value="editForm.url"
                        type="textarea"
                        :autosize="{ minRows: 3, maxRows: 8 }"
                        placeholder="https://github.com/..."
                        :disabled="!canModifySource"
                        class="bucket-input"
                      />
                      <p v-if="isMain" class="text-[11px] text-amber-500/80 mt-2">
                        main 源为系统核心源，请通过镜像切换功能统一修改。
                      </p>
                    </div>
                    <div class="flex gap-2 pt-2">
                      <NButton
                        size="small"
                        type="primary"
                        class="flex-1 !rounded-lg !h-9"
                        :disabled="!canModifySource || !editForm.url.trim()"
                        :loading="savingSource"
                        @click="saveEdit"
                      >
                        <template #icon><NIcon :component="CheckmarkOutline" size="15" /></template>
                        保存
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

  <NModal v-model:show="addModal" preset="card" title="添加软件源" :style="addDialogStyle" :mask-closable="true">
    <div class="flex flex-col gap-4">
      <div>
        <label class="text-xs text-gray-500 mb-1.5 block">Bucket 名称</label>
        <NInput v-model:value="newName" placeholder="如 extras" size="small" />
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1.5 block">Git 仓库链接（可选）</label>
        <NInput v-model:value="newUrl" placeholder="https://github.com/..." size="small" />
      </div>
      <NButton type="primary" size="small" :disabled="!newName.trim()" class="!mt-1" block @click="handleAdd">
        <template #icon><NIcon :component="AddOutline" size="15" /></template>
        添加
      </NButton>
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

.bucket-technical {
  font-family: var(--font-mono);
}

.bucket-input :deep(textarea) {
  font-family: var(--font-mono);
}
</style>
