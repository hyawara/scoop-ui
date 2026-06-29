<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { NScrollbar, NTag, NButton, NIcon } from 'naive-ui'
import { CloudDownloadOutline, SearchOutline } from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import AppDetail from '@/components/AppDetail.vue'

const props = defineProps<{ query: string }>()
const packagesStore = usePackagesStore()
const selectedPackage = ref<any>(null)

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

watch(
  () => props.query,
  (q) => {
    if (q.trim()) {
      packagesStore.search(q)
      selectedPackage.value = null
    }
  },
  { immediate: true }
)

function selectPackage(pkg: any) {
  selectedPackage.value = pkg
}
</script>

<template>
  <div class="flex gap-4 h-full">
    <!-- Left: Search Results -->
    <div class="w-1/2 flex flex-col min-w-0">
      <div class="flex items-center gap-2 mb-3 text-sm text-gray-500">
        <SearchOutline class="w-4 h-4" />
        <span>搜索 "<strong class="text-gray-700 dark:text-gray-200">{{ query }}</strong>" 的结果</span>
        <NTag size="small" :bordered="false">{{ packagesStore.searchResults.length }} 个结果</NTag>
      </div>

      <NScrollbar class="flex-1">
        <div v-if="packagesStore.loading" class="flex justify-center py-12">
          <div class="w-6 h-6 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
        </div>

        <div v-else-if="packagesStore.searchResults.length === 0" class="flex flex-col items-center py-12 text-gray-400">
          <p class="text-sm">未找到相关软件包</p>
        </div>

        <div v-else class="flex flex-col gap-1 pr-1">
          <div
            v-for="pkg in packagesStore.searchResults"
            :key="pkg.name"
            @click="selectPackage(pkg)"
            class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            :class="{
              'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-200 dark:ring-purple-800': selectedPackage?.name === pkg.name,
            }"
          >
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              :class="installedNames.has(pkg.name)
                ? 'bg-gradient-to-br from-green-400 to-emerald-500'
                : 'bg-gradient-to-br from-blue-400 to-purple-500'"
            >
              <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm truncate">{{ pkg.name }}</span>
                <NTag v-if="installedNames.has(pkg.name)" size="small" type="success" :bordered="false">
                  已安装
                </NTag>
                <NTag v-else size="small" :bordered="false">未安装</NTag>
              </div>
              <p class="text-xs text-gray-400 truncate mt-0.5">{{ pkg.description || '暂无描述' }}</p>
            </div>
            <div class="text-xs text-gray-400 flex-shrink-0">{{ pkg.version || '' }}</div>
          </div>
        </div>
      </NScrollbar>
    </div>

    <!-- Right: Detail Panel -->
    <div class="w-1/2">
      <AppDetail
        v-if="selectedPackage"
        :pkg="selectedPackage"
        :installed="installedNames.has(selectedPackage.name)"
      />
      <div v-else class="h-full flex flex-col items-center justify-center text-gray-400 bg-black/[0.01] dark:bg-white/[0.02] rounded-xl">
        <CloudDownloadOutline class="w-16 h-16 mb-4 opacity-20" />
        <p class="text-sm">选择一个软件包查看详情</p>
      </div>
    </div>
  </div>
</template>
