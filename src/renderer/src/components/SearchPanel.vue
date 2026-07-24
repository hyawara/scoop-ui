<script setup lang="ts">
import { watch, computed, ref, inject, onMounted } from 'vue'
import { NScrollbar, NEmpty, NSkeleton, NAlert, NButton, useMessage } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import AppDetailDrawer, { type AppDetailPayload } from '@/components/AppDetailDrawer.vue'
import AppListItem from '@/components/AppListItem.vue'
import { usePackageProgress } from '@/composables/usePackageProgress'
import { useSourceSyncPreflight } from '@/composables/useSourceSyncPreflight'
import type { InstallOptions } from '@/types'

const props = defineProps<{ query: string }>()
const packagesStore = usePackagesStore()
const message = useMessage()
const isSearching = ref(false)
const showSpeedupBanner = ref(false)
const installingSearchEngine = ref(false)

const pkgProgress = usePackageProgress()
const { ensureSourceReadyBeforeCommand } = useSourceSyncPreflight()
const openTerminal = inject<() => void>('openTerminal', () => {})
const installingSet = ref<Set<string>>(new Set())

// ─── 详情抽屉状态 ───────────────────────────────────
const showDetailDrawer = ref(false)
const selectedPackage = ref<AppDetailPayload | null>(null)

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

const searchEngineReady = computed(() => packagesStore.searchEngine.installed)

function assertScoopCommandSuccess(result: any, fallback: string) {
  if (!result?.success) {
    throw new Error(result?.error || (result?.aborted ? `${fallback}已中止` : `${fallback}失败`))
  }
}

onMounted(() => {
  packagesStore.loadSearchEngineStatus().then(() => {
    showSpeedupBanner.value = !packagesStore.searchEngine.installed
  })
})

watch(
  () => props.query,
  async (q) => {
    if (q.trim()) {
      isSearching.value = true
      selectedPackage.value = null
      showDetailDrawer.value = false
      packagesStore.searchResults = []
      try {
        await packagesStore.loadSearchEngineStatus()
        showSpeedupBanner.value = !packagesStore.searchEngine.installed
        await packagesStore.search(q)
      } finally {
        isSearching.value = false
      }
    }
  },
  { immediate: true }
)

async function installSearchEngine() {
  if (installingSearchEngine.value) return
  const shouldContinue = await ensureSourceReadyBeforeCommand('安装 scoop-search', 'before-search-engine-install')
  if (!shouldContinue) return
  installingSearchEngine.value = true
  openTerminal()
  try {
    const result = await packagesStore.installSearchEngine()
    if (!result.success) {
      throw new Error(result.error || 'scoop-search 安装失败')
    }
    message.success('scoop-search 已启用，搜索引擎切换完成')
    showSpeedupBanner.value = false
    if (props.query.trim()) {
      isSearching.value = true
      await packagesStore.search(props.query)
    }
  } catch (e) {
    message.error((e as Error).message || 'scoop-search 安装失败')
  } finally {
    isSearching.value = false
    installingSearchEngine.value = false
  }
}

function selectPackage(pkg: any) {
  const installed = packagesStore.installed.find((p: any) => p.name === pkg.name)
  selectedPackage.value = {
    name: pkg.name,
    version: pkg.version,
    bucket: pkg.bucket,
    description: pkg.description,
    homepage: pkg.website,
    global: installed?.global ?? pkg.global,
  }
  showDetailDrawer.value = true
}

function showPkgLogs(_name: string) {
  openTerminal()
}

async function quickInstall(pkgName: string, options?: InstallOptions) {
  if (installingSet.value.has(pkgName)) return
  const shouldContinue = await ensureSourceReadyBeforeCommand(`安装 ${pkgName}`, 'before-search-install')
  if (!shouldContinue) return
  openTerminal()
  installingSet.value = new Set([...installingSet.value, pkgName])
  pkgProgress.startProcessing(pkgName)
  try {
    // 直接调用 API，绕过 store.install 的全局进度监听（避免冲突）
    const result = await window.scoopAPI.install(pkgName, options || { global: false, skipCheck: false, independent: false, noUpdateScoop: true })
    assertScoopCommandSuccess(result, `${pkgName} 安装`)
    message.success(`${pkgName} 安装完成`)
    // 刷新已安装列表（静默）
    packagesStore.loadInstalled()
  } catch (e: any) {
    message.error(e?.message || `${pkgName} 安装失败`)
  } finally {
    pkgProgress.finishProcessing()
    const next = new Set(installingSet.value)
    next.delete(pkgName)
    installingSet.value = next
  }
}

async function handleDrawerUninstall(name: string, global: boolean, options?: { purge?: boolean }) {
  openTerminal()
  try {
    const result = await window.scoopAPI.uninstall(name, global, options)
    assertScoopCommandSuccess(result, `${name} 卸载`)
    message.success(`${name} 已卸载`)
    packagesStore.loadInstalled()
    showDetailDrawer.value = false
  } catch (e) {
    message.error((e as Error).message || `${name} 卸载失败`)
  }
}

async function handleDrawerUpdate(name: string, global = false) {
  if (pkgProgress.isProcessing.value) return
  const shouldContinue = await ensureSourceReadyBeforeCommand(`强制更新 ${name}`, 'before-search-force-update')
  if (!shouldContinue) return

  openTerminal()
  pkgProgress.startProcessing(name)
  try {
    const result = await window.scoopAPI.update(name, { force: true, global })
    assertScoopCommandSuccess(result, `${name} 强制更新`)
    message.success(`${name} 强制更新完成`)
    await Promise.all([
      packagesStore.loadInstalled(),
      packagesStore.loadUpdatable(),
    ])
  } catch (e: any) {
    message.error(e?.message || `强制更新 ${name} 失败`)
  } finally {
    pkgProgress.finishProcessing()
  }
}

const skeletonItems = Array.from({ length: 5 })
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 顶部标题条 -->
    <div class="flex items-center gap-2 mb-3 h-9 px-1">
      <SearchOutline class="w-4 h-4 text-slate-400" />
      <span class="text-sm dark:text-slate-400 text-gray-600">
        搜索 "<strong class="dark:text-white text-gray-900">{{ query }}</strong>" 的结果
      </span>
      <span class="px-2 py-0.5 text-[12px] dark:bg-white/[0.06] bg-black/[0.04] dark:text-slate-400 text-gray-500 rounded-md font-mono">
        {{ isSearching || packagesStore.searching ? '搜索中...' : `${packagesStore.searchResults.length} 个` }}
      </span>
      <span
        class="px-2 py-0.5 text-[11px] rounded-md font-mono"
        :class="searchEngineReady
          ? 'dark:bg-emerald-500/10 bg-emerald-100 dark:text-emerald-300 text-emerald-700'
          : 'dark:bg-amber-500/10 bg-amber-100 dark:text-amber-300 text-amber-700'"
      >
        {{ searchEngineReady ? 'scoop-search' : 'native' }}
      </span>
    </div>

    <NAlert
      v-if="showSpeedupBanner && !searchEngineReady"
      type="warning"
      closable
      class="mb-3 !rounded-lg dark:!bg-amber-500/10"
      @close="showSpeedupBanner = false"
    >
      <div class="flex items-center gap-3">
        <span class="text-[13px] leading-5 flex-1">
          🚀 检查到您未安装 <code class="font-mono">scoop-search</code> 插件，当前搜索可能需要 10秒以上。点击此处一键安装，让搜索瞬间提速 100 倍！
        </span>
        <NButton
          size="small"
          type="warning"
          secondary
          :loading="installingSearchEngine"
          :disabled="installingSearchEngine"
          class="!rounded-md flex-shrink-0"
          @click="installSearchEngine"
        >
          一键安装加速
        </NButton>
      </div>
    </NAlert>

    <!-- 搜索结果列表：单栏铺满，点击行 → 弹出详情抽屉 -->
    <NScrollbar class="flex-1">
      <!-- 骨架屏 -->
      <div v-if="(isSearching || packagesStore.searching) && packagesStore.searchResults.length === 0" class="flex flex-col pr-1">
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
          :active="pkgProgress.isCurrent(pkg.name)"
          @select="selectPackage"
          @install="(name: string, options?: InstallOptions) => quickInstall(name, options)"
          @show-logs="showPkgLogs"
        />
      </div>

      <!-- 空结果 -->
      <div v-else class="flex flex-col items-center py-16 text-slate-500">
        <NEmpty description="未找到相关软件包" />
      </div>
    </NScrollbar>

    <!-- 详情抽屉：统一入口 -->
    <AppDetailDrawer
      v-model:show="showDetailDrawer"
      :pkg="selectedPackage"
      :is-installed="!!selectedPackage && installedNames.has(selectedPackage.name)"
      :processing="!!selectedPackage && (installingSet.has(selectedPackage.name) || pkgProgress.isCurrent(selectedPackage.name))"
      @install="(name: string, options: InstallOptions) => quickInstall(name, options)"
      @uninstall="handleDrawerUninstall"
      @update="handleDrawerUpdate"
    />
  </div>
</template>
