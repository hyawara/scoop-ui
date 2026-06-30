<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import { NScrollbar, NTag, NIcon, NButton, NEmpty, NSkeleton } from 'naive-ui'
import { SearchOutline, CloudDownloadOutline } from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import AppDetail from '@/components/AppDetail.vue'

const props = defineProps<{ query: string }>()
const packagesStore = usePackagesStore()
const selectedPackage = ref<any>(null)
const isSearching = ref(false)

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

watch(
  () => props.query,
  async (q) => {
    if (q.trim()) {
      isSearching.value = true
      selectedPackage.value = null
      await packagesStore.search(q)
      isSearching.value = false
    }
  },
  { immediate: true }
)

function selectPackage(pkg: any) {
  selectedPackage.value = pkg
}

const skeletonItems = Array.from({ length: 5 })
</script>

<template>
  <div class="flex gap-4 h-full items-stretch">
    <!-- Left: Search Results -->
    <div class="w-5/12 flex flex-col min-w-0">
      <!-- Header bar — 与右侧对齐用 -->
      <div class="flex items-center gap-2 mb-3 h-9">
        <SearchOutline class="w-4 h-4 text-slate-400" />
        <span class="text-sm text-slate-400">搜索 "<strong class="text-white">{{ query }}</strong>" 的结果</span>
        <NTag size="small" :bordered="false" class="!bg-white/[0.06] !text-slate-400">
          {{ isSearching ? '搜索中...' : `${packagesStore.searchResults.length} 个` }}
        </NTag>
      </div>

      <NScrollbar class="flex-1">
        <!-- 骨架屏：仅在搜索中且无结果时显示 -->
        <div v-if="isSearching && packagesStore.searchResults.length === 0" class="flex flex-col gap-1.5 pr-1">
          <div
            v-for="(_, i) in skeletonItems"
            :key="i"
            class="flex items-center gap-3 p-3 rounded-xl bg-[#1e222b] border border-white/[0.04]"
          >
            <NSkeleton :width="40" :height="40" :border-radius="12" />
            <div class="flex-1 space-y-2">
              <NSkeleton :width="i % 3 === 0 ? '55%' : '40%'" :height="14" :border-radius="4" />
              <NSkeleton :width="i % 2 === 0 ? '75%' : '50%'" :height="10" :border-radius="4" />
            </div>
            <NSkeleton :width="52" :height="22" :border-radius="8" />
          </div>
        </div>

        <!-- 搜索结果列表 — 有数据时立即渲染，不等 isSearching -->
        <div v-else-if="packagesStore.searchResults.length > 0" class="flex flex-col gap-1.5 pr-1">
          <div
            v-for="pkg in packagesStore.searchResults"
            :key="pkg.name"
            @click="selectPackage(pkg)"
            class="group flex items-center gap-3 p-3 rounded-xl bg-[#1e222b] hover:bg-[#262b36] border border-white/[0.06] hover:border-white/[0.1] transition-all micro-card cursor-pointer"
            :class="{
              'bg-purple-500/15 !border-purple-500/30': selectedPackage?.name === pkg.name,
            }"
          >
            <!-- 首字母渐变徽章 -->
            <div
              class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105"
              :class="installedNames.has(pkg.name) ? '!from-green-400 !to-emerald-500' : ''"
            >
              <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
            </div>

            <!-- 包名 + Bucket + 描述 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm truncate text-slate-100">{{ pkg.name }}</span>
                <NTag v-if="installedNames.has(pkg.name)" size="tiny" :bordered="false"
                  class="!bg-emerald-500/15 !text-emerald-400">已安装</NTag>
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <NTag v-if="pkg.bucket" size="tiny" :bordered="false"
                  class="!bg-violet-900/40 !text-violet-300">{{ pkg.bucket }}</NTag>
                <span class="text-xs text-slate-400 truncate">{{ pkg.description || '暂无描述' }}</span>
              </div>
            </div>

            <!-- 版本号 -->
            <div class="flex-shrink-0">
              <NTag size="small" :bordered="false" class="!bg-white/[0.06] !text-slate-300 font-mono">
                {{ pkg.version || '' }}
              </NTag>
            </div>
          </div>
        </div>

        <!-- 空结果 -->
        <div v-else class="flex flex-col items-center py-16 text-slate-500">
          <NEmpty description="未找到相关软件包" />
        </div>
      </NScrollbar>
    </div>

    <!-- Right: Detail Panel -->
    <div class="w-7/12 flex flex-col min-w-0">
      <!-- 标题栏 — 与左侧搜索结果头部像素级对齐 -->
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
