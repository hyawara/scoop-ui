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
  useMessage,
} from 'naive-ui'
import {
  DownloadOutline,
  TrashOutline,
  CubeOutline,
  CheckmarkDoneOutline,
  CompassOutline,
  Cube,
  RefreshOutline,
  AddOutline,
  CloseOutline,
  StopCircleOutline,
  TerminalOutline,
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import StorageEnvCard from '@/components/StorageEnvCard.vue'
import ProxyCard from '@/components/ProxyCard.vue'

const packagesStore = usePackagesStore()
const message = useMessage()

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

// Bucket drawer state
const showBucketDrawer = ref(false)
const buckets = ref<{ name: string; source: string }[]>([])
const loadingBuckets = ref(false)
const addBucketModal = ref(false)
const newBucketName = ref('')
const newBucketRepo = ref('')
const updatingAll = ref(false)

// Terminal log state
const logs = ref<string[]>([])
const logVisible = ref(false)
const logContainerRef = ref<HTMLDivElement | null>(null)

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
  logs.value.push(trimmed)
  logVisible.value = true
  scrollLogToBottom()
}

onMounted(() => {
  window.scoopAPI.onLog((data) => {
    if (data?.message) {
      addLogLine(data.message)
    }
  })
})

onUnmounted(() => {
  window.scoopAPI.removeLogListener()
})

watch(logs, scrollLogToBottom)

function clearLogs() {
  logs.value = []
  logVisible.value = false
}

function handleInstall(pkgName: string) {
  packagesStore.install(pkgName)
  message.info(`正在安装 ${pkgName}...`)
}

function handleUpdate(pkg: any) {
  packagesStore.update(pkg.name)
  message.info(`正在更新 ${pkg.name}...`)
}

function handleUninstall(pkg: any) {
  packagesStore.uninstall(pkg.name)
  message.info(`已卸载 ${pkg.name}`)
}

async function handleUpdateAll() {
  updatingAll.value = true
  try {
    await packagesStore.update()
    message.success('全部更新完成')
    await packagesStore.loadUpdatable()
  } finally {
    updatingAll.value = false
  }
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
  <div class="flex gap-5 items-stretch h-full">
    <!-- === 左侧大卡片 (7/12) === -->
    <div class="w-7/12 min-w-0 h-full">
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
            <span class="font-semibold text-base text-slate-800 dark:text-gray-200 ml-5">应用管理</span>
          </template>
          <template #suffix>
            <div class="flex items-center gap-1 mr-3">
              <NButton size="tiny" secondary @click="openBucketDrawer" class="!rounded-lg">
                <template #icon><NIcon :component="Cube" size="14" /></template>
                软件源
              </NButton>
            </div>
          </template>

          <NTabPane name="installed" tab="已安装" class="flex-1 overflow-hidden">
            <!-- 全屏终端日志模式: loading 且有日志时铺满整个左侧卡片 -->
            <div v-if="packagesStore.loading && logVisible" class="flex flex-col h-full">
              <div class="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800/50">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span class="text-xs text-slate-300 font-medium">命令执行中...</span>
                </div>
                <NButton size="tiny" @click="clearLogs" class="!rounded-lg">
                  <template #icon><StopCircleOutline class="w-3.5 h-3.5" /></template>
                  结束日志
                </NButton>
              </div>
              <div
                ref="logContainerRef"
                class="flex-1 overflow-y-auto bg-[#1e1e20] p-4"
              >
                <div class="font-mono text-xs text-green-400/90 leading-relaxed space-y-0.5">
                  <div v-for="(line, i) in logs" :key="i" class="whitespace-pre-wrap break-all">
                    <span class="text-slate-500 mr-2 select-none">[{{ String(i + 1).padStart(3, '0') }}]</span>{{ line }}
                  </div>
                  <span v-if="packagesStore.loading" class="inline-block w-2 h-4 bg-green-400/70 animate-pulse ml-1" />
                </div>
              </div>
            </div>

            <!-- 正常列表模式 -->
            <template v-else>
              <div v-if="packagesStore.loading" class="flex justify-center py-8">
                <div class="flex flex-col items-center gap-2">
                  <div class="w-5 h-5 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
                  <span class="text-xs text-gray-400">加载中...</span>
                </div>
              </div>

              <div v-else-if="packagesStore.installed.length === 0" class="flex flex-col h-full overflow-y-auto">
                <div class="flex flex-col items-center justify-center pt-10 pb-5 px-8 flex-shrink-0">
                  <NEmpty description="暂无已安装的软件包">
                    <template #icon>
                      <NIcon :component="CubeOutline" size="48" class="text-gray-300 dark:text-gray-600" />
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
                        <span class="text-xs font-medium text-slate-700 dark:text-gray-300">{{ pkg.name }}</span>
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

              <NScrollbar v-else class="h-full custom-scrollbar">
                <div class="flex flex-col gap-1.5 p-4">
                  <div v-for="pkg in packagesStore.installed" :key="pkg.name"
                    class="flex items-center gap-3 p-3 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors micro-card"
                  >
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-sm truncate text-gray-700 dark:text-gray-200">{{ pkg.name }}</span>
                        <NTag size="small" :bordered="false" type="info">{{ pkg.version }}</NTag>
                        <NTag v-if="pkg.global" size="small" :bordered="false"
                          class="!bg-blue-100 !text-blue-700 dark:!bg-blue-900/40 dark:!text-blue-300"
                        >🌐 Global</NTag>
                      </div>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                      <NButton v-if="updatableNames.has(pkg.name)" text size="small" type="warning" @click="handleUpdate(pkg)">
                        <template #icon><NIcon :component="DownloadOutline" size="14" /></template> 更新
                      </NButton>
                      <NButton text size="small" type="error" @click="handleUninstall(pkg)">
                        <template #icon><NIcon :component="TrashOutline" size="14" /></template>
                      </NButton>
                    </div>
                  </div>
                </div>
              </NScrollbar>
            </template>
          </NTabPane>

          <NTabPane name="updatable" tab="有可更新" class="flex-1 overflow-hidden">
            <div class="flex flex-col h-full">
              <div v-if="packagesStore.updatable.length > 0" class="flex-shrink-0 px-4 pt-3 pb-2">
                <NButton size="small" type="primary" :loading="updatingAll" @click="handleUpdateAll"
                  class="w-full !rounded-lg" secondary
                >
                  <template #icon><NIcon :component="RefreshOutline" size="14" /></template>
                  ✨ 一键更新全部软件
                </NButton>
              </div>
              <div v-if="packagesStore.updatable.length === 0" class="flex-1 flex flex-col items-center justify-center py-20">
                <NEmpty description="所有软件均为最新版本">
                  <template #icon><NIcon :component="CheckmarkDoneOutline" size="48" class="text-gray-300 dark:text-gray-600" /></template>
                </NEmpty>
              </div>
              <NScrollbar v-else class="flex-1 custom-scrollbar">
                <div class="flex flex-col gap-1.5 p-4 pt-0">
                  <div v-for="pkg in packagesStore.updatable" :key="pkg.name"
                    class="flex items-center gap-3 p-3 rounded-xl bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors micro-card"
                  >
                    <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-medium text-sm text-gray-700 dark:text-gray-200">{{ pkg.name }}</span>
                        <NTag size="small" :bordered="false" class="!bg-amber-100 !text-amber-700 dark:!bg-amber-900/40 dark:!text-amber-300 font-mono">
                          {{ pkg.oldVersion }} → {{ pkg.newVersion }}
                        </NTag>
                      </div>
                    </div>
                    <NButton size="small" type="primary" secondary @click="handleUpdate(pkg)" :loading="packagesStore.loading">更新</NButton>
                  </div>
                </div>
              </NScrollbar>
            </div>
          </NTabPane>

          <NTabPane name="discover" tab="软件发现" class="flex-1 overflow-hidden">
            <div class="flex flex-col h-full overflow-y-auto">
              <div class="flex flex-col items-center justify-center pt-10 pb-5 px-8 flex-shrink-0">
                <NEmpty description="在搜索框中探索新软件">
                  <template #icon><NIcon :component="CompassOutline" size="48" class="text-gray-300 dark:text-gray-600" /></template>
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
                      <span class="text-xs font-medium text-slate-700 dark:text-gray-300">{{ pkg.name }}</span>
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

    <!-- === 右侧列：两张卡片，无滚动 === -->
    <div class="flex-1 flex flex-col gap-4 h-full min-w-0">
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
                <span class="font-medium text-sm text-gray-700 dark:text-gray-200">{{ b.name }}</span>
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

    <NModal v-model:show="addBucketModal" preset="card" title="添加 Bucket" style="width: 450px">
      <NSpace vertical>
        <NInput v-model:value="newBucketName" placeholder="Bucket 名称 (如 extras)" />
        <NInput v-model:value="newBucketRepo" placeholder="Git 仓库链接 (可选)" />
        <NButton type="primary" :disabled="!newBucketName" @click="addBucket" block>添加</NButton>
      </NSpace>
    </NModal>
  </div>
</template>
