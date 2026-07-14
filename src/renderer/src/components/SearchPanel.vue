<script setup lang="ts">
import { watch, computed, ref, inject } from 'vue'
import { NScrollbar, NEmpty, NSkeleton, useMessage } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import AppDetailDrawer, { type AppDetailPayload } from '@/components/AppDetailDrawer.vue'
import AppListItem from '@/components/AppListItem.vue'
import { usePackageProgress } from '@/composables/usePackageProgress'
import type { InstallOptions } from '@/types'

const props = defineProps<{ query: string }>()
const packagesStore = usePackagesStore()
const message = useMessage()
const isSearching = ref(false)

const pkgProgress = usePackageProgress()
const openTerminal = inject<() => void>('openTerminal', () => {})
const installingSet = ref<Set<string>>(new Set())

// ─── 详情抽屉状态 ───────────────────────────────────
const showDetailDrawer = ref(false)
const selectedPackage = ref<AppDetailPayload | null>(null)

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

watch(
  () => props.query,
  async (q) => {
    if (q.trim()) {
      isSearching.value = true
      selectedPackage.value = null
      showDetailDrawer.value = false
      packagesStore.searchResults = []
      await packagesStore.search(q)
      isSearching.value = false
    }
  },
  { immediate: true }
)

function selectPackage(pkg: any) {
  selectedPackage.value = {
    name: pkg.name,
    version: pkg.version,
    bucket: pkg.bucket,
    description: pkg.description,
    homepage: pkg.website,
  }
  showDetailDrawer.value = true
}

function showPkgLogs(_name: string) {
  openTerminal()
}

async function quickInstall(pkgName: string, options?: InstallOptions) {
  if (installingSet.value.has(pkgName)) return
  openTerminal()
  installingSet.value = new Set([...installingSet.value, pkgName])
  pkgProgress.startProcessing(pkgName)
  try {
    // 直接调用 API，绕过 store.install 的全局进度监听（避免冲突）
    await window.scoopAPI.install(pkgName, options || { global: false, skipCheck: false, independent: false })
    message.success(`${pkgName} 安装完成`)
    // 刷新已安装列表（静默）
    packagesStore.loadInstalled()
  } catch {
    message.error(`${pkgName} 安装失败`)
  } finally {
    pkgProgress.finishProcessing()
    const next = new Set(installingSet.value)
    next.delete(pkgName)
    installingSet.value = next
  }
}

async function handleDrawerUninstall(name: string, global: boolean) {
  try {
    await window.scoopAPI.uninstall(name, global)
    message.success(`${name} 已卸载`)
    packagesStore.loadInstalled()
    showDetailDrawer.value = false
  } catch (e) {
    message.error((e as Error).message || `${name} 卸载失败`)
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
        {{ isSearching ? '搜索中...' : `${packagesStore.searchResults.length} 个` }}
      </span>
    </div>

    <!-- 搜索结果列表：单栏铺满，点击行 → 弹出详情抽屉 -->
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
          :active="pkgProgress.isCurrent(pkg.name)"
          @select="selectPackage"
          @install="(name: string) => quickInstall(name)"
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
      :processing="!!selectedPackage && installingSet.has(selectedPackage.name)"
      @install="(name: string, options: InstallOptions) => quickInstall(name, options)"
      @uninstall="handleDrawerUninstall"
    />
  </div>
</template>
