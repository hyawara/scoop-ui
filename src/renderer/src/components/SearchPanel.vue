<script setup lang="ts">
import { watch, computed, ref, nextTick } from 'vue'
import { NScrollbar, NEmpty, NSkeleton, NButton, useMessage } from 'naive-ui'
import { SearchOutline, CloudDownloadOutline } from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import AppDetail from '@/components/AppDetail.vue'
import AppListItem from '@/components/AppListItem.vue'
import TerminalDrawer from '@/components/TerminalDrawer.vue'
import { usePackageProgress } from '@/composables/usePackageProgress'

const props = defineProps<{ query: string }>()
const packagesStore = usePackagesStore()
const message = useMessage()
const selectedPackage = ref<any>(null)
const isSearching = ref(false)

// 行内进度系统
const pkgProgress = usePackageProgress()
const installingSet = ref<Set<string>>(new Set())

// 单包日志弹窗
const showPkgLogModal = ref(false)
const activePkgLogName = ref('')
const pkgLogContainerRef = ref<HTMLDivElement | null>(null)

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

// 正在安装的包名集合（传给 AppDetail 用来隐藏安装按钮）
const installingNames = computed(() => installingSet.value)

watch(
  () => props.query,
  async (q) => {
    if (q.trim()) {
      isSearching.value = true
      selectedPackage.value = null
      packagesStore.searchResults = []
      await packagesStore.search(q)
      isSearching.value = false
    }
  },
  { immediate: true }
)

function selectPackage(pkg: any) {
  selectedPackage.value = pkg
}

function scrollLogToBottom() {
  nextTick(() => {
    if (pkgLogContainerRef.value) {
      pkgLogContainerRef.value.scrollTop = pkgLogContainerRef.value.scrollHeight
    }
  })
}

function showPkgLogs(name: string) {
  activePkgLogName.value = name
  showPkgLogModal.value = true
  scrollLogToBottom()
}

const activePkgLogLines = computed(() => {
  if (!activePkgLogName.value) return []
  const p = pkgProgress.getProgress(activePkgLogName.value)
  return p ? p.logs : []
})

// 日志弹窗打开时，新日志自动滚底
watch(() => activePkgLogLines.value.length, () => {
  if (showPkgLogModal.value) scrollLogToBottom()
})

// 当前日志包的进度数据（供TerminalDrawer使用）
const currentPkgProgress = computed(() => {
  if (!activePkgLogName.value) return null
  return pkgProgress.getProgress(activePkgLogName.value) || null
})

async function quickInstall(pkgName: string) {
  if (installingSet.value.has(pkgName)) return
  const s = new Set(installingSet.value)
  s.add(pkgName)
  installingSet.value = s
  pkgProgress.startUpdate(pkgName)
  try {
    // 直接调用 API，绕过 store.install 的全局进度监听（避免冲突）
    await window.scoopAPI.install(pkgName, { global: false, skipCheck: false, independent: false })
    // 安装成功：瞬间完成，不设 success 延迟
    pkgProgress.finishUpdate(pkgName)
    message.success(`${pkgName} 安装完成`)
    // 刷新已安装列表（静默）
    packagesStore.loadInstalled()
  } catch {
    pkgProgress.failUpdate(pkgName)
    message.error(`${pkgName} 安装失败`)
  } finally {
    const next = new Set(installingSet.value)
    next.delete(pkgName)
    installingSet.value = next
  }
}

const skeletonItems = Array.from({ length: 5 })
</script>

<template>
  <div class="flex gap-4 h-full items-stretch">
    <!-- Left: Search Results -->
    <div class="w-5/12 flex flex-col min-w-0">
      <div class="flex items-center gap-2 mb-3 h-9">
        <SearchOutline class="w-4 h-4 text-slate-400" />
        <span class="text-sm dark:text-slate-400 text-gray-600">搜索 "<strong class="dark:text-white text-gray-900">{{ query }}</strong>" 的结果</span>
        <span class="px-2 py-0.5 text-[12px] dark:bg-white/[0.06] bg-black/[0.04] dark:text-slate-400 text-gray-500 rounded-md font-mono">
          {{ isSearching ? '搜索中...' : `${packagesStore.searchResults.length} 个` }}
        </span>
      </div>

      <NScrollbar class="flex-1">
        <!-- 骨架屏 -->
        <div v-if="isSearching && packagesStore.searchResults.length === 0" class="flex flex-col pr-1">
          <div
            v-for="(_, i) in skeletonItems"
            :key="i"
            class="flex items-center gap-3 h-11 px-4 border-b dark:border-white/[0.04] border-black/[0.06]"
          >
            <NSkeleton :width="28" :height="28" :border-radius="6" />
            <div class="flex-1 space-y-2">
              <NSkeleton :width="'45%'" :height="12" :border-radius="4" />
            </div>
            <NSkeleton :width="40" :height="20" :border-radius="4" />
          </div>
        </div>

        <!-- 搜索结果列表 -->
        <div v-else-if="packagesStore.searchResults.length > 0" class="flex flex-col pr-1">
          <AppListItem
            v-for="pkg in packagesStore.searchResults"
            :key="pkg.name"
            :pkg="pkg"
            mode="search"
            :is-selected="selectedPackage?.name === pkg.name"
            :is-installed="installedNames.has(pkg.name)"
            :disabled="installingSet.has(pkg.name)"
            :progress="pkgProgress.getProgress(pkg.name)"
            @select="selectPackage"
            @install="quickInstall"
            @show-logs="showPkgLogs"
          />
        </div>

        <!-- 空结果 -->
        <div v-else class="flex flex-col items-center py-16 text-slate-500">
          <NEmpty description="未找到相关软件包" />
        </div>
      </NScrollbar>
    </div>

    <!-- Right: Detail Panel -->
    <div class="w-7/12 flex flex-col min-w-0">
      <div class="flex items-center gap-2 mb-3 h-9">
        <span class="text-sm text-slate-400">软件包详细信息</span>
      </div>

      <div class="flex-1 min-h-0">
        <AppDetail
          v-if="selectedPackage"
          :pkg="selectedPackage"
          :installed="installedNames.has(selectedPackage.name)"
          :is-installing="installingSet.has(selectedPackage.name)"
        />
        <div v-else class="h-full flex flex-col items-center justify-center dark:text-slate-500 text-gray-500 rounded-lg border border-dashed dark:border-white/[0.08] border-black/[0.08]">
          <CloudDownloadOutline class="w-16 h-16 mb-0 opacity-20" />
          <p class="text-sm mt-4">选择一个软件包查看详情</p>
        </div>
      </div>
    </div>

    <!-- 单包终端日志抽屉 -->
    <TerminalDrawer
      v-model:show="showPkgLogModal"
      :progress="currentPkgProgress"
      :package-name="activePkgLogName"
    />
  </div>
</template>
