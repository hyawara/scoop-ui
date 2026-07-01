<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  NCard,
  NTabs,
  NTabPane,
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
  NCheckbox,
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
  AddOutline,
  CloseOutline,
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import { useSettingsStore } from '@/stores/settings'
import StorageEnvCard from '@/components/StorageEnvCard.vue'
import ProxyCard from '@/components/ProxyCard.vue'
import UpdateManager from '@/components/UpdateManager.vue'
import AppListItem from '@/components/AppListItem.vue'
import { usePackageProgress } from '@/composables/usePackageProgress'

const packagesStore = usePackagesStore()
const settingsStore = useSettingsStore()
const message = useMessage()
const dialog = useDialog()

// 批量卸载弹窗引用，用于手动关闭
const batchUninstallDialogReforge = ref<ReturnType<typeof dialog.warning> | null>(null)

// 行内进度系统
const pkgProgress = usePackageProgress()
const updatingPackages = ref<Set<string>>(new Set())

// 单包日志弹窗
const showPkgLogModal = ref(false)
const activePkgLogName = ref('')
const activePkgLogs = ref<string[]>([])
const pkgLogContainerRef = ref<HTMLDivElement | null>(null)

// 图标缓存
const iconMap = ref<Record<string, string | null>>({})
const iconFetching = ref<Set<string>>(new Set())

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

// 图标获取
async function fetchIcon(name: string) {
  if (iconMap.value[name] !== undefined || iconFetching.value.has(name)) return
  iconFetching.value = new Set(iconFetching.value).add(name)
  try {
    const result = await window.scoopAPI.getAppIcon(name)
    iconMap.value = { ...iconMap.value, [name]: result.icon || null }
  } catch {
    iconMap.value = { ...iconMap.value, [name]: null }
  } finally {
    const next = new Set(iconFetching.value)
    next.delete(name)
    iconFetching.value = next
  }
}

function getIcon(name: string): string | null {
  return iconMap.value[name] ?? null
}

// 批量预加载已安装软件的图标（异步，不阻塞 UI）
function preloadIcons() {
  const names = packagesStore.installed.map((p: any) => p.name)
  // 限制并发 5 个，避免过多 PowerShell 进程
  const concurrency = 5
  let idx = 0
  function next() {
    if (idx >= names.length) return
    const name = names[idx++]
    fetchIcon(name).then(() => next())
  }
  for (let i = 0; i < Math.min(concurrency, names.length); i++) {
    next()
  }
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

function scrollLogToBottom() {
  nextTick(() => {
    if (pkgLogContainerRef.value) {
      pkgLogContainerRef.value.scrollTop = pkgLogContainerRef.value.scrollHeight
    }
  })
}

onMounted(() => {
  loadSelectedFromStorage()
  // 行内进度日志监听
  window.scoopAPI.onLog((data) => {
    if (data?.package && data?.message) {
      const pkgName = data.package
      // 分发到对应包的进度
      if (updatingPackages.value.has(pkgName) || pkgProgress.hasProgress(pkgName)) {
        pkgProgress.handleLog(pkgName, data.message)
        // 更新日志弹窗（如果正在查看该包）
        if (activePkgLogName.value === pkgName) {
          activePkgLogs.value.push(data.message)
          scrollLogToBottom()
        }
      }
    }
  })
  checkingUpdates.value = true
  packagesStore.loadUpdatable().finally(() => {
    checkingUpdates.value = false
  })
})

// 当已安装列表变化时，异步预加载图标
watch(() => packagesStore.installed.length, () => {
  if (packagesStore.installed.length > 0) {
    nextTick(preloadIcons)
  }
}, { immediate: true })

onUnmounted(() => {
  window.scoopAPI.removeLogListener()
})

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
  activePkgLogs.value = []
}

function showPkgLogs(name: string) {
  activePkgLogName.value = name
  const p = pkgProgress.getProgress(name)
  activePkgLogs.value = p ? [...p.logs] : []
  showPkgLogModal.value = true
  scrollLogToBottom()
}

function handleInstall(pkgName: string) {
  packagesStore.install(pkgName)
  message.info(`正在安装 ${pkgName}...`)
}

async function handleUpdate(pkg: any) {
  if (updatingPackages.value.has(pkg.name)) return
  const s = new Set(updatingPackages.value)
  s.add(pkg.name)
  updatingPackages.value = s
  pkgProgress.startUpdate(pkg.name)
  try {
    await window.scoopAPI.update(pkg.name)
    // 清除图标缓存，更新后重新提取
    await window.scoopAPI.clearAppIcon(pkg.name)
    iconMap.value = { ...iconMap.value, [pkg.name]: undefined }
    // 零延迟闪变：立即原地改写版本号 + 抹除更新态
    const newVer = getNewVersion(pkg.name)
    const pkgInList = packagesStore.installed.find((p: any) => p.name === pkg.name)
    if (pkgInList && newVer) pkgInList.version = newVer
    // 本地移除更新态（不等 reload）
    packagesStore.updatable = packagesStore.updatable.filter((p: any) => p.name !== pkg.name)
    pkgProgress.finishUpdate(pkg.name)
    // 后台静默刷新（不阻塞 UI 反馈）
    packagesStore.loadInstalled()
    packagesStore.loadUpdatable()
    // 异步重新获取图标
    fetchIcon(pkg.name)
  } catch (e: any) {
    pkgProgress.failUpdate(pkg.name)
    message.error(e.message || `更新 ${pkg.name} 失败`)
  } finally {
    const s2 = new Set(updatingPackages.value)
    s2.delete(pkg.name)
    updatingPackages.value = s2
  }
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
  // 为每个选中包启动行内进度
  const s = new Set(updatingPackages.value)
  for (const n of names) {
    s.add(n)
    pkgProgress.startUpdate(n)
  }
  updatingPackages.value = s
  try {
    // 逐个更新，让每个包的进度独立追踪
    for (const name of names) {
      try {
        await window.scoopAPI.update(name)
        // 清除图标缓存
        await window.scoopAPI.clearAppIcon(name)
        iconMap.value = { ...iconMap.value, [name]: undefined }
        // 零延迟闪变
        const newVer = getNewVersion(name)
        const pkgInList = packagesStore.installed.find((p: any) => p.name === name)
        if (pkgInList && newVer) pkgInList.version = newVer
        packagesStore.updatable = packagesStore.updatable.filter((p: any) => p.name !== name)
        pkgProgress.finishUpdate(name)
      } catch {
        pkgProgress.failUpdate(name)
      }
    }
    selectedPackages.value = new Set()
    saveSelectedToStorage()
    // 后台静默刷新
    packagesStore.loadInstalled()
    packagesStore.loadUpdatable()
    // 异步重新获取所有更新包的图标
    for (const name of names) {
      fetchIcon(name)
    }
  } finally {
    batchUpdating.value = false
    updatingPackages.value = new Set()
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
      // 为所有可更新包启动行内进度
      const names = packagesStore.updatable.map((p: any) => p.name)
      const s = new Set(updatingPackages.value)
      for (const n of names) {
        s.add(n)
        pkgProgress.startUpdate(n)
      }
      updatingPackages.value = s
      try {
        for (const name of names) {
          try {
            await window.scoopAPI.update(name)
            // 清除图标缓存
            await window.scoopAPI.clearAppIcon(name)
            iconMap.value = { ...iconMap.value, [name]: undefined }
            // 零延迟闪变
            const newVer = getNewVersion(name)
            const pkgInList = packagesStore.installed.find((p: any) => p.name === name)
            if (pkgInList && newVer) pkgInList.version = newVer
            packagesStore.updatable = packagesStore.updatable.filter((p: any) => p.name !== name)
            pkgProgress.finishUpdate(name)
          } catch {
            pkgProgress.failUpdate(name)
          }
        }
        selectedPackages.value = new Set()
        saveSelectedToStorage()
        // 后台静默刷新
        packagesStore.loadUpdatable()
        packagesStore.loadInstalled()
        // 异步重新获取所有更新包的图标
        for (const name of names) {
          fetchIcon(name)
        }
      } finally {
        updatingAll.value = false
        updatingPackages.value = new Set()
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
        class="overflow-hidden glass-card h-full"
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
              <NButton size="tiny" secondary @click="openBucketDrawer" class="!rounded-app">
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

              <!-- 批量操作工具栏（Raycast 风格，与列表行全等对齐） -->
              <div
                class="sticky top-0 z-20 py-2 backdrop-blur-md border-b border-white/[0.03]"
                style="background: rgba(18,19,26,0.95);"
              >
                <div class="flex items-center gap-3 px-4 h-14">
                  <!-- 左侧：全选 + 计数 -->
                  <div class="flex-shrink-0 w-6">
                    <NCheckbox
                      :checked="isAllSelected()"
                      :indeterminate="isIndeterminate()"
                      @update:checked="toggleSelectAll"
                    />
                  </div>
                  <span class="text-[14px] text-gray-500 select-none">
                    已选 <strong class="text-gray-300 font-medium">{{ selectedPackageNames.length }}</strong> 项
                  </span>

                  <!-- 右侧：操作按钮 -->
                  <div class="flex items-center gap-2 ml-auto">
                    <template v-if="checkingUpdates">
                      <div class="w-3.5 h-3.5 border-[1.5px] border-t-transparent border-gray-500 rounded-full animate-spin" />
                      <span class="text-[14px] text-gray-500">检查中...</span>
                    </template>
                    <template v-else>
                      <button
                        :disabled="selectedPackageNames.length === 0 || batchUpdating"
                        @click="handleBatchUpdate"
                        class="flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-medium rounded-md border transition-all select-none"
                        :class="selectedPackageNames.length === 0
                          ? 'border-white/[0.04] bg-transparent text-gray-600 cursor-not-allowed'
                          : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 cursor-pointer'"
                      >
                        <NIcon :component="DownloadOutline" :size="15" />
                        更新 ({{ selectedPackageNames.length }})
                      </button>
                      <button
                        :disabled="selectedPackageNames.length === 0"
                        @click="handleBatchUninstall"
                        class="flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-medium rounded-md border transition-all select-none"
                        :class="selectedPackageNames.length === 0
                          ? 'border-white/[0.04] bg-transparent text-gray-600 cursor-not-allowed'
                          : 'border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer'"
                      >
                        <NIcon :component="TrashOutline" :size="15" />
                        卸载 ({{ selectedPackageNames.length }})
                      </button>
                      <button
                        :disabled="packagesStore.updatable.length === 0 || updatingAll"
                        @click="handleUpdateAllConfirm"
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[14px] rounded-md transition-colors select-none"
                        :class="packagesStore.updatable.length === 0
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] cursor-pointer'"
                      >
                        全部更新
                      </button>
                    </template>
                  </div>
                </div>
              </div>

              <!-- 已安装列表（纯净单色流风格） -->
              <div class="flex flex-col pt-2 pb-4">
                <TransitionGroup name="list" tag="div" class="flex flex-col">
                  <AppListItem
                    v-for="pkg in packagesStore.installed"
                    :key="pkg.name"
                    :pkg="pkg"
                    :mode="updatableNames.has(pkg.name) ? 'updatable' : 'installed'"
                    :checked="selectedPackages.has(pkg.name)"
                    :disabled="uninstallingSet.has(pkg.name)"
                    :new-version="getNewVersion(pkg.name)"
                    :progress="pkgProgress.getProgress(pkg.name)"
                    :icon="getIcon(pkg.name)"
                    @toggle-check="toggleSelect"
                    @update="handleUpdate"
                    @uninstall="handleUninstall"
                    @show-logs="showPkgLogs"
                  />
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

    <!-- 单包终端日志弹窗 -->
    <NModal
      v-model:show="showPkgLogModal"
      preset="card"
      :title="`${activePkgLogName} 执行日志`"
      style="width: 640px"
      :closable="true"
      :mask-closable="true"
      :close-on-esc="true"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-xs text-slate-500">共 {{ activePkgLogs.length }} 行输出</span>
        <NButton size="tiny" quaternary @click="clearLogs" class="!rounded-lg">清空</NButton>
      </div>
      <div
        ref="pkgLogContainerRef"
        class="bg-[#090a0d] p-4 rounded-xl text-emerald-400 font-mono text-xs h-96 overflow-y-auto custom-scrollbar border border-white/[0.06]"
      >
        <div v-if="activePkgLogs.length === 0" class="text-slate-600 text-center py-8">
          暂无日志输出
        </div>
        <div v-for="(line, i) in activePkgLogs" :key="i" class="whitespace-pre-wrap break-all leading-relaxed">
          <span class="text-slate-600 mr-2 select-none">{{ String(i + 1).padStart(3, '0') }}</span>{{ line }}
        </div>
        <span v-if="updatingPackages.has(activePkgLogName)" class="inline-block w-2 h-4 bg-emerald-400/70 animate-pulse ml-1" />
      </div>
      <template #footer>
        <div class="flex justify-end">
          <NButton size="small" quaternary @click="showPkgLogModal = false" class="!rounded-lg">关闭</NButton>
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
