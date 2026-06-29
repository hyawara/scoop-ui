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
  <NCard :bordered="false" class="!rounded-xl h-full" content-class="h-full">
    <div class="flex items-center justify-between mb-2">
      <span class="font-semibold text-sm">缓存管理</span>
      <FolderOpenOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="flex items-center gap-4 mt-3">
      <div class="flex-shrink-0">
        <NProgress
          type="dashboard"
          :percentage="Math.min(settingsStore.cacheInfo.files * 5, 100)"
          :color="settingsStore.cacheInfo.files > 10 ? '#f0a020' : '#6B5BED'"
          :gap-offset-degree="0"
          :gap-degree="60"
        >
          <span class="text-xs text-gray-500">{{ settingsStore.cacheInfo.size || 0 }} MB</span>
        </NProgress>
      </div>

      <div class="flex-1 flex flex-col gap-2">
        <div class="flex justify-between text-xs text-gray-500">
          <span>缓存文件</span>
          <span class="font-mono">{{ settingsStore.cacheInfo.files || 0 }} 个</span>
        </div>
        <div class="flex justify-between text-xs text-gray-500">
          <span>占用空间</span>
          <span class="font-mono">{{ settingsStore.cacheInfo.size || 0 }} MB</span>
        </div>
        <NButton
          type="error"
          size="small"
          :loading="settingsStore.loading"
          @click="clearCache"
          class="mt-1"
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
