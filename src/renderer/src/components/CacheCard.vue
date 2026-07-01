<script setup lang="ts">
import { onMounted } from 'vue'
import { NCard, NProgress, NButton, NIcon, useMessage } from 'naive-ui'
import { TrashOutline, FolderOpenOutline } from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const message = useMessage()

onMounted(() => {
  settingsStore.loadCacheInfo()
})

async function clearCache() {
  await settingsStore.clearCache()
  message.success('缓存已清除')
}
</script>

<template>
  <NCard :bordered="false" class="glass-card" content-class="flex flex-col gap-3 p-4 pt-4">
    <div class="flex items-center justify-between">
      <span class="font-semibold text-base text-slate-800 dark:text-gray-200">缓存管理</span>
      <FolderOpenOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="flex items-center gap-4">
      <div class="flex-shrink-0">
        <NProgress
          type="dashboard"
          :percentage="Math.min(settingsStore.cacheInfo.files * 5, 100)"
          :color="settingsStore.cacheInfo.files > 10 ? '#f0a020' : '#6B5BED'"
          :gap-offset-degree="0"
          :gap-degree="60"
          :stroke-width="8"
        >
          <span class="text-xs text-gray-500">{{ settingsStore.cacheInfo.size || 0 }} MB</span>
        </NProgress>
      </div>

      <div class="flex-1 flex flex-col gap-2">
        <div class="flex justify-between text-xs text-gray-500">
          <span>缓存文件</span>
          <span class="font-mono tabular-nums">{{ settingsStore.cacheInfo.files || 0 }} 个</span>
        </div>
        <div class="flex justify-between text-xs text-gray-500">
          <span>占用空间</span>
          <span class="font-mono tabular-nums">{{ settingsStore.cacheInfo.size || 0 }} MB</span>
        </div>
        <NButton
          secondary
          size="small"
          :loading="settingsStore.loading"
          @click="clearCache"
          class="btn-hover-scale active:!scale-95 !rounded-lg"
          :disabled="settingsStore.cacheInfo.files === 0"
        >
          <template #icon>
            <NIcon :component="TrashOutline" size="14" />
          </template>
          一键清除缓存
        </NButton>
      </div>
    </div>
  </NCard>
</template>
