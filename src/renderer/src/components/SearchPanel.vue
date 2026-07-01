<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import { NScrollbar, NIcon, NEmpty, NSkeleton, useMessage } from 'naive-ui'
import { SearchOutline, CloudDownloadOutline, DownloadOutline } from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import AppDetail from '@/components/AppDetail.vue'
import AppListItem from '@/components/AppListItem.vue'

const props = defineProps<{ query: string }>()
const packagesStore = usePackagesStore()
const message = useMessage()
const selectedPackage = ref<any>(null)
const isSearching = ref(false)
const installing = ref<Set<string>>(new Set())

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

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

async function quickInstall(pkgName: string) {
  if (installing.value.has(pkgName)) return
  installing.value = new Set(installing.value).add(pkgName)
  try {
    await packagesStore.install(pkgName, { global: false, skipCheck: false, independent: false })
    message.success(`${pkgName} 安装完成`)
  } catch {
    message.error(`${pkgName} 安装失败`)
  } finally {
    const next = new Set(installing.value)
    next.delete(pkgName)
    installing.value = next
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
        <span class="text-sm text-slate-400">搜索 "<strong class="text-white">{{ query }}</strong>" 的结果</span>
        <NTag size="small" :bordered="false" class="!bg-white/[0.06] !text-slate-400">
          {{ isSearching ? '搜索中...' : `${packagesStore.searchResults.length} 个` }}
        </NTag>
      </div>

      <NScrollbar class="flex-1">
        <!-- 骨架屏 -->
        <div v-if="isSearching && packagesStore.searchResults.length === 0" class="flex flex-col pr-1">
          <div
            v-for="(_, i) in skeletonItems"
            :key="i"
            class="flex items-center gap-3 h-11 px-4 border-b border-white/[0.04]"
          >
            <NSkeleton :width="28" :height="28" :border-radius="6" />
            <div class="flex-1 space-y-2">
              <NSkeleton :width="'45%'" :height="12" :border-radius="4" />
            </div>
            <NSkeleton :width="40" :height="20" :border-radius="4" />
          </div>
        </div>

        <!-- 搜索结果列表（纯净单色流风格） -->
        <div v-else-if="packagesStore.searchResults.length > 0" class="flex flex-col pr-1">
          <AppListItem
            v-for="pkg in packagesStore.searchResults"
            :key="pkg.name"
            :pkg="pkg"
            mode="search"
            :is-selected="selectedPackage?.name === pkg.name"
            :is-installed="installedNames.has(pkg.name)"
            @select="selectPackage"
            @install="quickInstall"
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
        <span class="text-sm text-slate-400">📦 软件包详细信息</span>
      </div>

      <div class="flex-1 min-h-0">
        <AppDetail
          v-if="selectedPackage"
          :pkg="selectedPackage"
          :installed="installedNames.has(selectedPackage.name)"
        />
        <div v-else class="h-full flex flex-col items-center justify-center text-slate-500 rounded-xl border border-dashed border-white/[0.08]">
          <CloudDownloadOutline class="w-16 h-16 mb-4 opacity-20" />
          <p class="text-sm">选择一个软件包查看详情</p>
        </div>
      </div>
    </div>
  </div>
</template>
