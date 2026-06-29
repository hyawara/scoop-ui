<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NCard, NButton, NModal, NInput, NSpace, NProgress, useMessage } from 'naive-ui'
import { FolderOutline, SwapHorizontalOutline, ServerOutline } from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const message = useMessage()

const showMigrate = ref(false)
const newPath = ref('')

onMounted(async () => {
  await settingsStore.loadEnv()
  await settingsStore.loadDiskSpace()
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
  <NCard :bordered="false" class="!rounded-xl glass-card" content-class="flex flex-col gap-3 p-4 pt-4">
    <div class="flex items-center justify-between">
      <span class="font-semibold text-base text-slate-800 dark:text-gray-200">存储路径</span>
      <ServerOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="flex flex-col gap-3">
      <!-- Scoop Root -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <FolderOutline class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span class="text-[11px] text-gray-400 dark:text-gray-500 font-medium">Scoop Root</span>
        </div>
        <span
          class="font-semibold text-xs text-gray-800 dark:text-gray-200 truncate max-w-[120px] text-right"
          :title="settingsStore.scoopEnv.scoop || '使用默认路径'"
        >
          {{ settingsStore.scoopEnv.scoop || '使用默认路径' }}
        </span>
      </div>

      <!-- Global -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <FolderOutline class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span class="text-[11px] text-gray-400 dark:text-gray-500 font-medium">Global</span>
        </div>
        <span
          class="font-semibold text-xs text-gray-800 dark:text-gray-200 truncate max-w-[120px] text-right"
          :title="settingsStore.scoopEnv.global || '未配置原生路径'"
        >
          {{ settingsStore.scoopEnv.global || '未配置原生路径' }}
        </span>
      </div>

      <div class="h-px bg-gray-100 dark:bg-gray-700/50 my-1" />

      <div>
        <NProgress
          type="line"
          :percentage="diskPercent"
          :height="5"
          :border-radius="2"
          :show-indicator="false"
          color="#6B5BED"
        />
        <p class="text-[11px] text-gray-400 mt-1.5">{{ diskInfo }}</p>
      </div>

      <NButton size="small" dashed @click="showMigrate = true" class="w-full btn-hover-scale !rounded-lg">
        <template #icon>
          <SwapHorizontalOutline class="w-3.5 h-3.5" />
        </template>
        迁移目录
      </NButton>
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
