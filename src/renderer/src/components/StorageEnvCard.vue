<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NCard, NButton, NProgress, useMessage } from 'naive-ui'
import { FolderOutline, SwapHorizontalOutline, ServerOutline, RocketOutline, TrashOutline } from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const message = useMessage()

const showMigrate = ref(false)
const newPath = ref('')

onMounted(async () => {
  await settingsStore.loadEnv()
  await settingsStore.loadDiskSpace()
  await settingsStore.checkAria2()
  await settingsStore.loadCacheInfo()
})

function formatBytes(bytes: number): string {
  if (!bytes) return '0 GB'
  const gb = bytes / (1024 * 1024 * 1024)
  return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

const diskPercent = computed(() => {
  const ds = settingsStore.diskSpace
  if (!ds || !ds.Used || !ds.Free) return 50
  const total = ds.Used + ds.Free
  return Math.round((ds.Used / total) * 100)
})

const diskInfo = computed(() => {
  const ds = settingsStore.diskSpace
  if (!ds) return ''
  if (Array.isArray(ds)) {
    const drive = ds.find((d: any) => d.Used != null)
    if (drive) return `${formatBytes(drive.Free)} / ${formatBytes(drive.Used + drive.Free)} 可用`
  }
  if (ds.Used != null && ds.Free != null) {
    return `${formatBytes(ds.Free)} / ${formatBytes(ds.Used + ds.Free)} 可用`
  }
  return '加载中...'
})

async function clearCache() {
  await settingsStore.clearCache()
  message.success('缓存已清除')
}

async function migrate() {
  if (!newPath.value) {
    message.warning('请输入新的安装路径')
    return
  }
  await settingsStore.migrateScoop(newPath.value)
  showMigrate.value = false
  newPath.value = ''
  message.success('迁移已开始')
}
</script>

<template>
  <NCard :bordered="false" class="!rounded-xl glass-card" content-class="flex flex-col gap-3 p-4">
    <div class="flex items-center justify-between mb-1">
      <span class="font-semibold text-sm text-slate-800 dark:text-gray-200">存储与环境管理</span>
      <ServerOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="grid grid-cols-12 gap-4 items-start">
      <!-- 左侧 4 格: 缓存仪表盘 -->
      <div class="col-span-4 flex flex-col items-center gap-2">
        <NProgress
          type="dashboard"
          :percentage="Math.min(settingsStore.cacheInfo.files * 5, 100)"
          :color="settingsStore.cacheInfo.files > 10 ? '#f0a020' : '#6B5BED'"
          :gap-offset-degree="0"
          :gap-degree="60"
          :stroke-width="6"
        >
          <span class="text-[10px] text-gray-500">{{ settingsStore.cacheInfo.size || 0 }} MB</span>
        </NProgress>
        <span class="text-[10px] text-gray-400">{{ settingsStore.cacheInfo.files || 0 }} 个缓存文件</span>
        <NButton
          size="tiny"
          type="error"
          :loading="settingsStore.loading"
          @click="clearCache"
          class="w-full btn-hover-scale !rounded-lg"
          :disabled="settingsStore.cacheInfo.files === 0"
        >
          <template #icon><TrashOutline class="w-3 h-3" /></template>
          清除缓存
        </NButton>
      </div>

      <!-- 右侧 8 格: 环境信息 -->
      <div class="col-span-8 flex flex-col gap-2.5">
        <!-- Scoop Root -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <FolderOutline class="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span class="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Scoop Root</span>
          </div>
          <span
            class="font-medium text-[11px] text-gray-800 dark:text-gray-200 truncate max-w-[100px] text-right"
            :title="settingsStore.scoopEnv.scoop || '使用默认路径'"
          >
            {{ settingsStore.scoopEnv.scoop || '使用默认路径' }}
          </span>
        </div>

        <!-- Global -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <FolderOutline class="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span class="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Global</span>
          </div>
          <span
            class="font-medium text-[11px] text-gray-800 dark:text-gray-200 truncate max-w-[100px] text-right"
            :title="settingsStore.scoopEnv.global || '未配置原生路径'"
          >
            {{ settingsStore.scoopEnv.global || '未配置原生路径' }}
          </span>
        </div>

        <!-- Aria2 -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <RocketOutline class="w-3 h-3 text-gray-400 flex-shrink-0" />
            <span class="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Aria2 加速</span>
          </div>
          <span
            class="text-[10px] font-medium"
            :class="settingsStore.aria2Enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'"
          >
            <span v-if="settingsStore.aria2Enabled" class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 animate-pulse" />
            {{ settingsStore.aria2Enabled ? '已启用' : '未检测到' }}
          </span>
        </div>

        <div class="h-px bg-gray-100 dark:bg-gray-700/50" />

        <!-- 磁盘空间 -->
        <div>
          <NProgress
            type="line"
            :percentage="diskPercent"
            :height="4"
            :border-radius="2"
            :show-indicator="false"
            color="#6B5BED"
          />
          <p class="text-[10px] text-gray-400 mt-1">{{ diskInfo }}</p>
        </div>

        <NButton size="tiny" dashed @click="showMigrate = true" class="w-full btn-hover-scale !rounded-lg">
          <template #icon><SwapHorizontalOutline class="w-3 h-3" /></template>
          迁移目录
        </NButton>
      </div>
    </div>

    <NModal v-model:show="showMigrate" preset="card" title="迁移 Scoop 目录" style="width: 500px">
      <NSpace vertical>
        <p class="text-sm text-gray-500">将当前 Scoop 安装目录迁移到新的位置。此操作会复制所有现有数据，并更新系统环境变量。</p>
        <NInput v-model:value="newPath" placeholder="例如: D:\Scoop" />
        <NButton type="primary" :loading="settingsStore.loading" @click="migrate" block>开始迁移</NButton>
      </NSpace>
    </NModal>
  </NCard>
</template>
