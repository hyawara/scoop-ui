<script setup lang="ts">
import { watch, computed, ref } from 'vue'
import { NScrollbar, NTag, NIcon, NButton, NEmpty, NSkeleton, useMessage } from 'naive-ui'
import { SearchOutline, CloudDownloadOutline, DownloadOutline } from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import AppDetail from '@/components/AppDetail.vue'

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

async function quickInstall(pkg: any) {
  if (installing.value.has(pkg.name)) return
  installing.value = new Set(installing.value).add(pkg.name)
  try {
    await packagesStore.install(pkg.name, { global: false, skipCheck: false, independent: false })
    message.success(`${pkg.name} 安装完成`)
  } catch {
    message.error(`${pkg.name} 安装失败`)
  } finally {
    const next = new Set(installing.value)
    next.delete(pkg.name)
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
        <div v-if="isSearching && packagesStore.searchResults.length === 0" class="flex flex-col gap-1.5 pr-1">
          <div
            v-for="(_, i) in skeletonItems"
            :key="i"
            class="flex items-center gap-3 p-3 rounded-xl bg-[#1e222b] border border-white/[0.04]"
          >
            <NSkeleton :width="40" :height="40" :border-radius="12" />
            <div class="flex-1 space-y-2">
              <NSkeleton :width="'55%'" :height="14" :border-radius="4" />
              <NSkeleton :width="'40%'" :height="10" :border-radius="4" />
            </div>
            <NSkeleton :width="52" :height="32" :border-radius="8" />
          </div>
        </div>

        <!-- 搜索结果列表 -->
        <div v-else-if="packagesStore.searchResults.length > 0" class="flex flex-col gap-1.5 pr-1">
          <div
            v-for="pkg in packagesStore.searchResults"
            :key="pkg.name"
            @click="selectPackage(pkg)"
            class="group flex items-start gap-3 p-3 rounded-xl bg-[#1e222b] hover:bg-[#262b36] border border-white/[0.06] hover:border-white/[0.1] transition-all micro-card cursor-pointer"
            :class="{
              'bg-purple-500/15 !border-purple-500/30': selectedPackage?.name === pkg.name,
            }"
          >
            <!-- 首字母渐变徽章 -->
            <div
              class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm transition-transform group-hover:scale-105"
              :class="installedNames.has(pkg.name) ? '!from-green-400 !to-emerald-500' : ''"
            >
              <span class="text-white text-xs font-bold">{{ pkg.name[0] }}</span>
            </div>

            <div class="flex-1 min-w-0">
              <!-- 第一行：名称 + 版本号 + 软件源 | 安装按钮 -->
              <div class="flex items-center justify-between w-full gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-sm font-semibold text-white truncate">{{ pkg.name }}</span>
                  <span v-if="pkg.version" class="text-xs text-slate-400 font-mono flex-shrink-0">{{ pkg.version }}</span>
                  <NTag v-if="pkg.bucket" size="tiny" :bordered="false"
                    class="!bg-violet-900/40 !text-violet-300 flex-shrink-0">{{ pkg.bucket }}</NTag>
                  <NTag v-if="installedNames.has(pkg.name)" size="tiny" :bordered="false"
                    class="!bg-emerald-500/15 !text-emerald-400 flex-shrink-0">已安装</NTag>
                </div>
                <NButton
                  v-if="!installedNames.has(pkg.name)"
                  size="small"
                  :secondary="true"
                  :loading="installing.has(pkg.name)"
                  @click.stop="quickInstall(pkg)"
                  class="flex-shrink-0"
                >
                  <template #icon>
                    <NIcon :component="DownloadOutline" size="14" />
                  </template>
                </NButton>
              </div>
              <!-- 第二行：描述 -->
              <p v-if="pkg.description" class="text-xs text-slate-500 mt-1.5 truncate">{{ pkg.description }}</p>
              <p v-else-if="packagesStore.descriptionsLoading && !pkg.description" class="text-xs text-slate-600 mt-1.5 truncate">加载描述中...</p>
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
