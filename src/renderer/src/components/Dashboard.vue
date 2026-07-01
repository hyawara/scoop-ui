<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  NCard,
  NTabs,
  NTabPane,
  NTag,
  NButton,
  NIcon,
  NEmpty,
  NScrollbar,
  NDrawer,
  NDrawerContent,
  NSpace,
  NModal,
  NInput,
  NPopconfirm,
  NDropdown,
  NCheckbox,
  NProgress,
  NSpin,
  useMessage,
  useDialog,
} from 'naive-ui'
import {
  DownloadOutline,
  TrashOutline,
  CubeOutline,
  CompassOutline,
  Cube,
  RefreshOutline,
  AddOutline,
  CloseOutline,
  TerminalOutline,
  EllipsisVerticalOutline,
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import { useSettingsStore } from '@/stores/settings'
import StorageEnvCard from '@/components/StorageEnvCard.vue'
import ProxyCard from '@/components/ProxyCard.vue'
import UpdateManager from '@/components/UpdateManager.vue'
import TaskProgressCard from '@/components/TaskProgressCard.vue'

const packagesStore = usePackagesStore()
const settingsStore = useSettingsStore()
const message = useMessage()
const dialog = useDialog()

// 批量卸载弹窗引用，用于手动关闭
const batchUninstallDialogReforge = ref<ReturnType<typeof dialog.warning> | null>(null)

const recommendedPackages = [
  { name: 'git', icon: 'G', desc: '版本控制', bucket: 'main', color: 'from-orange-500 to-red-500' },
  { name: 'curl', icon: 'C', desc: 'HTTP 请求', bucket: 'main', color: 'from-green-500 to-teal-500' },
  { name: 'neovim', icon: 'N', desc: '终端编辑器', bucket: 'main', color: 'from-green-600 to-emerald-600' },
  { name: 'fzf', icon: 'F', desc: '模糊搜索', bucket: 'main', color: 'from-purple-500 to-pink-500' },
]

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

const updatableNames = computed(() =>
  new Set(packagesStore.updatable.map((p: any) => p.name))
)

function getNewVersion(name: string): string {
  const pkg = packagesStore.updatable.find((p: any) => p.name === name)
  return pkg?.newVersion || ''
}

// Bucket drawer state
const showBucketDrawer = ref(false)
const buckets = ref<{ name: string; source: string }[]>([])
const loadingBuckets = ref(false)
const addBucketModal = ref(false)
const newBucketName = ref('')
const newBucketRepo = ref('')
const checkingUpdates = ref(false)
const updatingAll = ref(false)

// Batch selection state
const selectedPackages = ref<Set<string>>(new Set())
const batchUpdating = ref(false)

// Uninstall state locks
const uninstallingSet = ref<Set<string>>(new Set())
const removingSet = ref<Set<string>>(new Set())

const SELECTED_STORAGE_KEY = 'scoop-ui-selected-packages'

function loadSelectedFromStorage() {
  try {
    const raw = localStorage.getItem(SELECTED_STORAGE_KEY)
    if (raw) {
      const arr: string[] = JSON.parse(raw)
      selectedPackages.value = new Set(arr)
    }
  } catch { /* ignore */ }
}

function saveSelectedToStorage() {
  try {
    localStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify([...selectedPackages.value]))
  } catch { /* ignore */ }
}

function toggleSelect(name: string) {
  const s = new Set(selectedPackages.value)
  if (s.has(name)) {
    s.delete(name)
  } else {
    s.add(name)
  }
  selectedPackages.value = s
  saveSelectedToStorage()
}

function toggleSelectAll() {
  const allNames = packagesStore.installed.map((p: any) => p.name)
  if (selectedPackages.value.size === allNames.length && allNames.every(n => selectedPackages.value.has(n))) {
    selectedPackages.value = new Set()
  } else {
    selectedPackages.value = new Set(allNames)
  }
  saveSelectedToStorage()
}

function isAllSelected(): boolean {
  const allNames = packagesStore.installed.map((p: any) => p.name)
  return allNames.length > 0 && allNames.every(n => selectedPackages.value.has(n))
}

function isIndeterminate(): boolean {
  const allNames = packagesStore.installed.map((p: any) => p.name)
  const count = allNames.filter(n => selectedPackages.value.has(n)).length
  return count > 0 && count < allNames.length
}

const selectedPackageNames = computed(() =>
  packagesStore.installed.filter((p: any) => selectedPackages.value.has(p.name)).map((p: any) => p.name)
)

// Terminal log state — logs always collected, shown only in modal
const terminalLogs = ref<string[]>([])
const showTerminalModal = ref(false)
const logContainerRef = ref<HTMLDivElement | null>(null)
const currentLogLine = ref('')

// Progress bar state
const batchProgress = ref(0)
const currentBatchTotal = ref(0)
const currentBatchDone = ref(0)

function scrollLogToBottom() {
  nextTick(() => {
    if (logContainerRef.value) {
      logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
    }
  })
}

function addLogLine(msg: string) {
  const trimmed = msg.trim()
  if (!trimmed) return
  terminalLogs.value.push(trimmed)
  currentLogLine.value = trimmed
  // Parse percentage from log line
  const match = trimmed.match(/\((\d+)%\)/) || trimmed.match(/(\d+)%/)
  if (match) {
    batchProgress.value = parseInt(match[1], 10)
  }
  scrollLogToBottom()
}

onMounted(() => {
  loadSelectedFromStorage()
  window.scoopAPI.onLog((data) => {
    if (data?.message) {
      addLogLine(data.message)
    }
  })
  checkingUpdates.value = true
  packagesStore.loadUpdatable().finally(() => {
    checkingUpdates.value = false
  })
})

onUnmounted(() => {
  window.scoopAPI.removeLogListener()
})

watch(terminalLogs, scrollLogToBottom)

// Sync selected state: remove entries for packages that are no longer installed
watch(() => packagesStore.installed, (list) => {
  const names = new Set(list.map((p: any) => p.name))
  let changed = false
  const s = new Set(selectedPackages.value)
  for (const name of s) {
    if (!names.has(name)) {
      s.delete(name)
      changed = true
    }
  }
  if (changed) {
    selectedPackages.value = s
    saveSelectedToStorage()
  }
}, { deep: true })

function clearLogs() {
  terminalLogs.value = []
}

function handleInstall(pkgName: string) {
  packagesStore.install(pkgName)
  message.info(`正在安装 ${pkgName}...`)
}

function handleUpdate(pkg: any) {
  packagesStore.update(pkg.name)
  message.info(`正在更新 ${pkg.name}...`)
}

async function handleUninstall(pkg: any) {
  if (uninstallingSet.value.has(pkg.name)) return
  const s = new Set(uninstallingSet.value)
  s.add(pkg.name)
  uninstallingSet.value = s
  try {
    await window.scoopAPI.uninstall(pkg.name, pkg.global)
    // 成功时静默处理：卡片滑出动画本身就是最好的反馈
    // Exit animation then remove from list
    const r = new Set(removingSet.value)
    r.add(pkg.name)
    removingSet.value = r
    await new Promise(resolve => setTimeout(resolve, 400))
    await packagesStore.loadInstalled()
    await packagesStore.loadUpdatable()
  } catch (e: any) {
    // 仅在失败时显示错误通知
    message.error(e.message || `卸载 ${pkg.name} 失败`)
  } finally {
    const s2 = new Set(uninstallingSet.value)
    s2.delete(pkg.name)
    uninstallingSet.value = s2
    const r2 = new Set(removingSet.value)
    r2.delete(pkg.name)
    removingSet.value = r2
  }
}

async function handleBatchUpdate() {
  const names = selectedPackageNames.value
  if (names.length === 0) {
    message.warning('请先勾选需要更新的软件')
    return
  }
  batchUpdating.value = true
  batchProgress.value = 0
  currentBatchTotal.value = names.length
  currentBatchDone.value = 0
  try {
    await packagesStore.updateBatch(names)
    message.success(`已更新 ${names.length} 个软件`)
    selectedPackages.value = new Set()
    saveSelectedToStorage()
    await packagesStore.loadUpdatable()
  } finally {
    batchUpdating.value = false
    batchProgress.value = 0
  }
}

function handleUpdateAllConfirm() {
  const count = packagesStore.updatable.length
  if (count === 0) return
  dialog.warning({
    title: '确认全部更新',
    content: `是否确定更新全部 ${count} 个软件？这可能会消耗较多网络资源和时间。`,
    positiveText: '立即更新',
    negativeText: '取消',
    onPositiveClick: async () => {
      updatingAll.value = true
      batchProgress.value = 0
      currentBatchTotal.value = count
      currentBatchDone.value = 0
      try {
        await packagesStore.update()
        message.success('全部更新完成')
        selectedPackages.value = new Set()
        saveSelectedToStorage()
        await packagesStore.loadUpdatable()
      } finally {
        updatingAll.value = false
        batchProgress.value = 0
      }
    },
  })
}

function handleBatchUninstall() {
  const names = selectedPackageNames.value
  if (names.length === 0) return
  batchUninstallDialogReforge.value = dialog.warning({
    title: '确认批量卸载',
    content: `确定要彻底卸载已选中的 ${names.length} 款软件吗？此操作不可逆。`,
    positiveText: '确认卸载',
    negativeText: '取消',
    onPositiveClick: () => {
      // 立即关闭弹窗，不等待异步操作
      batchUninstallDialogReforge.value?.destroy()
      batchUninstallDialogReforge.value = null
      // 执行卸载（不返回 Promise，让弹窗立即关闭）
      executeBatchUninstall(names)
      return true // 返回 true 确保关闭
    },
  })
}

async function executeBatchUninstall(names: string[]) {
  // 锁定所有选中卡片
  const s = new Set(uninstallingSet.value)
  for (const n of names) s.add(n)
  uninstallingSet.value = s

  let failed = 0
  for (const name of names) {
    try {
      const pkg = packagesStore.installed.find((p: any) => p.name === name)
      await window.scoopAPI.uninstall(name, pkg?.global || false)
      // 退出动画：逐个标记移除
      const r = new Set(removingSet.value)
      r.add(name)
      removingSet.value = r
      await new Promise(resolve => setTimeout(resolve, 350))
    } catch {
      failed++
    }
  }

  // 精简通知：仅在有失败时提示，成功则静默
  if (failed > 0) {
    message.warning(`${names.length - failed} 个卸载成功，${failed} 个卸载失败`)
  }

  selectedPackages.value = new Set()
  saveSelectedToStorage()
  await packagesStore.loadInstalled()
  await packagesStore.loadUpdatable()

  // 解锁
  uninstallingSet.value = new Set()
  removingSet.value = new Set()
}

async function openBucketDrawer() {
  showBucketDrawer.value = true
  loadingBuckets.value = true
  try {
    buckets.value = await window.scoopAPI.listBuckets()
  } catch {
    buckets.value = []
    message.error('获取 Bucket 列表失败')
  } finally {
    loadingBuckets.value = false
  }
}

async function addBucket() {
  if (!newBucketName.value) return
  try {
    await window.scoopAPI.addBucket(newBucketName.value, newBucketRepo.value || undefined)
    message.success(`Bucket ${newBucketName.value} 已添加`)
    addBucketModal.value = false
    newBucketName.value = ''
    newBucketRepo.value = ''
    buckets.value = await window.scoopAPI.listBuckets()
  } catch (e: any) {
    message.error(e.message || '添加失败')
  }
}

async function removeBucket(name: string) {
  try {
    await window.scoopAPI.removeBucket(name)
    message.info(`Bucket ${name} 已移除`)
    buckets.value = await window.scoopAPI.listBuckets()
  } catch (e: any) {
    message.error(e.message || '移除失败')
  }
}
</script>

<template>
  <div class="flex gap-5 h-full">
    <!-- === 左侧大卡片 (约 60%) === -->
    <div class="flex-[3] min-w-0 h-full">
      <NCard
        :bordered="false"
        class="!rounded-xl overflow-hidden glass-card h-full"
        content-class="!p-0 flex flex-col h-full"
      >
        <NTabs
          type="line"
          size="large"
          :default-value="'installed'"
          class="flex-1 flex flex-col overflow-hidden"
          :pane-style="{ padding: '0', height: '100%' }"
        >
          <template #prefix>
            <span class="font-semibold text-base text-white ml-5">应用管理</span>
          </template>
          <template #suffix>
            <div class="flex items-center gap-1 mr-3">
              <NButton size="tiny" secondary @click="openBucketDrawer" class="!rounded-lg">
                <template #icon><NIcon :component="Cube" size="14" /></template>
                软件源
              </NButton>
            </div>
          </template>

          <NTabPane name="installed" class="flex-1 overflow-hidden">
            <template #tab>
              <span>已安装</span>
              <span v-if="updatableNames.size > 0"
                class="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              >{{ updatableNames.size }}</span>
            </template>

            <!-- 初始加载状态 -->
            <div v-if="packagesStore.loading && packagesStore.installed.length === 0" class="flex justify-center py-8">
              <div class="flex flex-col items-center gap-2">
                <div class="w-5 h-5 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
                <span class="text-xs text-gray-400">加载中...</span>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-else-if="packagesStore.installed.length === 0" class="flex flex-col h-full overflow-y-auto">
              <div class="flex flex-col items-center justify-center pt-10 pb-5 px-8 flex-shrink-0">
                <NEmpty description="暂无已安装的软件包">
                  <template #icon>
                    <NIcon :component="CubeOutline" size="48" class="text-gray-300 text-slate-600" />
                  </template>
                  <template #extra>
                    <p class="text-xs text-gray-400 mt-1">使用顶部搜索框查找并安装软件</p>
                  </template>
                </NEmpty>
              </div>
              <div class="flex-1 flex flex-col justify-end mt-4 mx-5 mb-4">
                <div class="bg-slate-50/70 dark:bg-gray-800/40 rounded-xl p-4 border border-slate-100/60 dark:border-gray-700/30">
                  <div class="flex items-center gap-2 mb-4">
                    <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">热门推荐</span>
                    <div class="flex-1 h-px bg-slate-200/60 dark:bg-gray-700/40" />
                  </div>
                  <div class="grid grid-cols-4 gap-3">
                    <div v-for="pkg in recommendedPackages" :key="pkg.name"
                      class="flex flex-col items-center gap-2 p-3 rounded-xl bg-white dark:bg-gray-800/60 hover:bg-slate-50 dark:hover:bg-gray-700/50 border border-slate-100 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200 group"
                    >
                      <div class="w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform" :class="pkg.color">
                        <span class="text-white text-sm font-bold">{{ pkg.icon }}</span>
                      </div>
                      <span class="text-xs font-medium text-slate-700 text-slate-300">{{ pkg.name }}</span>
                      <span class="text-[10px] text-slate-400 -mt-1">{{ pkg.desc }}</span>
                      <NButton size="tiny" secondary :disabled="installedNames.has(pkg.name)"
                        :loading="packagesStore.loading && packagesStore.progress?.package === pkg.name"
                        @click.stop="handleInstall(pkg.name)" class="!mt-1 btn-hover-scale w-full !rounded-lg"
                      >{{ installedNames.has(pkg.name) ? '已安装' : '安装' }}</NButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 已安装列表（常驻显示，永不消失） -->
            <NScrollbar v-else class="h-full custom-scrollbar">
              <!-- 自我更新通知条 -->
              <UpdateManager class="mx-4 mt-3" />

              <!-- 批量操作工具栏（毛玻璃吸顶，与卡片像素级对齐） -->
              <div
                class="sticky top-0 z-20 -mx-4 pl-7 pr-5 py-2.5 flex items-center justify-between backdrop-blur-md border-b border-white/[0.04]"
                style="background: rgba(18,19,26,0.85);"
              >
                <!-- 左侧：全选 + 计数 -->
                <div class="flex items-center gap-4">
                  <NCheckbox
                    :checked="isAllSelected()"
                    :indeterminate="isIndeterminate()"
                    @update:checked="toggleSelectAll"
                  >
                    <span class="text-xs text-slate-400 select-none">全选</span>
                  </NCheckbox>
                  <div class="w-px h-3.5 bg-white/[0.08]" />
                  <span class="text-xs text-slate-400 select-none">
                    已选 <strong class="text-slate-200 font-medium">{{ selectedPackageNames.length }}</strong> 项
                  </span>
                </div>

                <!-- 右侧：操作按钮 -->
                <div class="flex items-center gap-2">
                  <template v-if="checkingUpdates">
                    <div class="w-3 h-3 border-[1.5px] border-t-transparent border-slate-500 rounded-full animate-spin" />
                    <span class="text-xs text-slate-500">检查中...</span>
                  </template>
                  <template v-else>
                    <button
                      :disabled="selectedPackageNames.length === 0 || batchUpdating"
                      @click="handleBatchUpdate"
                      class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border transition-all select-none"
                      :class="selectedPackageNames.length === 0
                        ? 'border-white/[0.06] bg-white/[0.03] text-slate-500 cursor-not-allowed'
                        : 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/40 cursor-pointer'"
                    >
                      <NIcon :component="DownloadOutline" :size="12" />
                      更新选中项 ({{ selectedPackageNames.length }})
                    </button>
                    <button
                      :disabled="selectedPackageNames.length === 0"
                      @click="handleBatchUninstall"
                      class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border transition-all select-none"
                      :class="selectedPackageNames.length === 0
                        ? 'border-white/[0.06] bg-white/[0.03] text-slate-500 cursor-not-allowed'
                        : 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40 cursor-pointer'"
                    >
                      <NIcon :component="TrashOutline" :size="12" />
                      卸载选中项 ({{ selectedPackageNames.length }})
                    </button>
                    <button
                      :disabled="packagesStore.updatable.length === 0 || updatingAll"
                      @click="handleUpdateAllConfirm"
                      class="flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors select-none"
                      :class="packagesStore.updatable.length === 0
                        ? 'text-slate-600 cursor-not-allowed'
                        : 'text-slate-400/80 hover:text-slate-200 hover:bg-white/[0.04] cursor-pointer'"
                    >
                      一键全部更新
                    </button>
                  </template>
                </div>
              </div>

              <!-- 已安装列表（始终渲染，永不消失） -->
              <div class="flex flex-col gap-1.5 pt-3 pb-4 px-4">
                <TransitionGroup name="list" tag="div" class="flex flex-col gap-1.5">
                  <div v-for="pkg in packagesStore.installed" :key="pkg.name"
                    class="flex items-center gap-3 p-3 rounded-xl bg-[#1e222b] hover:bg-[#262b36] border border-white/[0.06] hover:border-white/[0.1] transition-all duration-300 micro-card"
                    :class="{
                      'opacity-40 pointer-events-none': uninstallingSet.has(pkg.name),
                    }"
                  >
                    <div class="flex-shrink-0 w-5">
                      <NCheckbox
                        :checked="selectedPackages.has(pkg.name)"
                        @update:checked="toggleSelect(pkg.name)"
                        :disabled="uninstallingSet.has(pkg.name)"
                      />
                    </div>

                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-sm truncate text-slate-100">{{ pkg.name }}</span>
                        <NTag size="small" :bordered="false" class="!bg-white/[0.06] !text-slate-400">{{ pkg.version }}</NTag>
                        <NTag v-if="pkg.bucket" size="small" :bordered="false"
                          class="!bg-violet-900/40 !text-violet-300"
                        >{{ pkg.bucket }}</NTag>
                        <NTag v-if="pkg.global" size="small" :bordered="false"
                          class="!bg-blue-900/40 !text-blue-300"
                        >🌐 Global</NTag>
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5 flex-shrink-0">
                      <NTag v-if="updatableNames.has(pkg.name)" size="tiny" :bordered="false"
                        class="!bg-amber-500/10 !text-amber-400 font-mono" style="border: 1px solid rgba(251,191,36,0.3)"
                      >→ {{ getNewVersion(pkg.name) }}</NTag>
                      <NButton v-if="updatableNames.has(pkg.name)" text size="small" class="!text-amber-400 hover:!text-amber-300" @click="handleUpdate(pkg)">
                        <template #icon><NIcon :component="DownloadOutline" size="14" /></template> 更新
                      </NButton>
                      <NSpin v-if="uninstallingSet.has(pkg.name)" size="small" />
                      <NButton v-else text size="small" class="!text-rose-400 hover:!text-rose-500" @click="handleUninstall(pkg)">
                        <template #icon><NIcon :component="TrashOutline" size="14" /></template>
                      </NButton>
                    </div>
                  </div>
                </TransitionGroup>
              </div>
            </NScrollbar>
          </NTabPane>

          <NTabPane name="discover" tab="软件发现" class="flex-1 overflow-hidden">
            <div class="flex flex-col h-full overflow-y-auto">
              <div class="flex flex-col items-center justify-center pt-10 pb-5 px-8 flex-shrink-0">
                <NEmpty description="在搜索框中探索新软件">
                  <template #icon><NIcon :component="CompassOutline" size="48" class="text-gray-300 text-slate-600" /></template>
                  <template #extra><p class="text-xs text-gray-400 mt-1">支持数千款开源软件的一键安装</p></template>
                </NEmpty>
              </div>
              <div class="flex-1 flex flex-col justify-end mt-4 mx-5 mb-4">
                <div class="bg-slate-50/70 dark:bg-gray-800/40 rounded-xl p-4 border border-slate-100/60 dark:border-gray-700/30">
                  <div class="flex items-center gap-2 mb-4">
                    <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">热门发现</span>
                    <div class="flex-1 h-px bg-slate-200/60 dark:bg-gray-700/40" />
                  </div>
                  <div class="grid grid-cols-4 gap-3">
                    <div v-for="pkg in recommendedPackages" :key="pkg.name"
                      class="flex flex-col items-center gap-2 p-3 rounded-xl bg-white dark:bg-gray-800/60 hover:bg-slate-50 dark:hover:bg-gray-700/50 border border-slate-100 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200 group"
                    >
                      <div class="w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform" :class="pkg.color">
                        <span class="text-white text-sm font-bold">{{ pkg.icon }}</span>
                      </div>
                      <span class="text-xs font-medium text-slate-700 text-slate-300">{{ pkg.name }}</span>
                      <span class="text-[10px] text-slate-400 -mt-1">{{ pkg.desc }}</span>
                      <NButton size="tiny" secondary :disabled="installedNames.has(pkg.name)"
                        @click.stop="handleInstall(pkg.name)" class="!mt-1 btn-hover-scale w-full !rounded-lg"
                      >{{ installedNames.has(pkg.name) ? '已安装' : '安装' }}</NButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </NTabPane>
        </NTabs>
      </NCard>
    </div>

    <!-- === 右侧列 === -->
    <div class="flex-[2] flex flex-col gap-5 h-full min-w-0 overflow-y-auto">
      <StorageEnvCard />
      <ProxyCard />
      <TaskProgressCard
        :is-updating="batchUpdating || updatingAll"
        :progress="batchProgress"
        :current-line="currentLogLine"
        :terminal-logs="terminalLogs"
        @show-logs="showTerminalModal = true"
      />
    </div>

    <!-- Bucket Drawer -->
    <NDrawer v-model:show="showBucketDrawer" width="400" placement="right">
      <NDrawerContent title="📦 软件源管理 (Bucket)" closable>
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">已添加 {{ buckets.length }} 个 Bucket</span>
            <NButton size="small" secondary @click="addBucketModal = true" class="!rounded-lg">
              <template #icon><NIcon :component="AddOutline" size="14" /></template>添加 Bucket
            </NButton>
          </div>
          <div v-if="loadingBuckets" class="flex justify-center py-12">
            <div class="flex flex-col items-center gap-3">
              <div class="w-5 h-5 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
              <span class="text-xs text-gray-400">加载中...</span>
            </div>
          </div>
          <div v-else-if="buckets.length === 0" class="flex flex-col items-center py-12 text-gray-400">
            <CubeOutline class="w-12 h-12 mb-2 opacity-30" />
            <p class="text-sm">暂无 Bucket</p>
          </div>
          <div v-else class="flex flex-col gap-2">
            <div v-for="b in buckets" :key="b.name"
              class="flex items-center gap-3 p-3 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                <span class="text-white text-xs font-bold uppercase">{{ b.name[0] }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <span class="font-medium text-sm text-gray-700 text-slate-100">{{ b.name }}</span>
                <p class="text-[10px] text-gray-400 truncate">{{ b.source }}</p>
              </div>
              <NPopconfirm @positive-click="removeBucket(b.name)">
                <template #trigger><NButton text size="small" type="error"><template #icon><NIcon :component="CloseOutline" size="14" /></template></NButton></template>
                确认移除 {{ b.name }}？
              </NPopconfirm>
            </div>
          </div>
        </div>
      </NDrawerContent>
    </NDrawer>

    <!-- Add Bucket Modal -->
    <NModal v-model:show="addBucketModal" preset="card" title="添加 Bucket" style="width: 450px">
      <NSpace vertical>
        <NInput v-model:value="newBucketName" placeholder="Bucket 名称 (如 extras)" />
        <NInput v-model:value="newBucketRepo" placeholder="Git 仓库链接 (可选)" />
        <NButton type="primary" :disabled="!newBucketName" @click="addBucket" block>添加</NButton>
      </NSpace>
    </NModal>

    <!-- 终端日志弹窗（独立 Modal，关闭不中断后台） -->
    <NModal
      v-model:show="showTerminalModal"
      preset="card"
      title="Scoop 后台执行日志"
      style="width: 640px"
      :closable="true"
      :mask-closable="true"
      :close-on-esc="true"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs text-slate-500">共 {{ terminalLogs.length }} 行输出</span>
        <NButton size="tiny" quaternary @click="clearLogs" class="!rounded-lg">清空</NButton>
      </div>
      <div
        ref="logContainerRef"
        class="bg-[#090a0d] p-4 rounded-xl text-emerald-400 font-mono text-xs h-96 overflow-y-auto custom-scrollbar border border-white/[0.06]"
      >
        <div v-if="terminalLogs.length === 0" class="text-slate-600 text-center py-8">
          暂无日志输出
        </div>
        <div v-for="(line, i) in terminalLogs" :key="i" class="whitespace-pre-wrap break-all leading-relaxed">
          <span class="text-slate-600 mr-2 select-none">{{ String(i + 1).padStart(3, '0') }}</span>{{ line }}
        </div>
        <span v-if="batchUpdating || updatingAll" class="inline-block w-2 h-4 bg-emerald-400/70 animate-pulse ml-1" />
      </div>
      <template #footer>
        <div class="flex justify-end">
          <NButton size="small" quaternary @click="showTerminalModal = false" class="!rounded-lg">关闭</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
/* 零延迟原地蒸发 + 列表精准补位 */
.list-leave-active {
  position: absolute;
  width: 100%;
  opacity: 0;
  transition: none !important; /* 彻底杀死淡出延迟，瞬间蒸发 */
}

.list-leave-to {
  opacity: 0;
}

/* 下方卡片补位：干脆利落的微秒级上推 */
.list-move {
  transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* 进入动画（备用） */
.list-enter-active {
  transition: all 0.15s ease-out;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
