<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NCard, NButton, NModal, NInput, NSpace, NProgress, useMessage } from 'naive-ui'
import { FolderOutline, SwapHorizontalOutline } from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const message = useMessage()

const showMigrate = ref(false)
const newPath = ref('')
const freeSpace = ref(0)
const totalSpace = ref(0)

onMounted(() => {
  settingsStore.loadEnv()
})

function getDiskLabel(path: string): string {
  if (!path) return '未知'
  const match = path.match(/^([A-Z]):/i)
  return match ? `${match[1]}盘` : path
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
  <NCard :bordered="false" class="!rounded-xl h-full" content-class="h-full">
    <div class="flex items-center justify-between mb-2">
      <span class="font-semibold text-sm">存储路径</span>
      <FolderOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="flex flex-col gap-2 mt-2">
      <div class="flex justify-between items-center text-xs">
        <span class="text-gray-500">Scoop Root</span>
        <span class="font-mono text-xs truncate max-w-[140px]" :title="settingsStore.scoopEnv.scoop || '未设置'">
          {{ getDiskLabel(settingsStore.scoopEnv.scoop) || '未设置' }}
        </span>
      </div>
      <div class="flex justify-between items-center text-xs">
        <span class="text-gray-500">Global</span>
        <span class="font-mono text-xs truncate max-w-[140px]" :title="settingsStore.scoopEnv.global || '未设置'">
          {{ getDiskLabel(settingsStore.scoopEnv.global) || '未设置' }}
        </span>
      </div>

      <div class="mt-2">
        <NProgress
          type="line"
          :percentage="70"
          :height="6"
          :border-radius="3"
          :show-indicator="false"
          color="#6B5BED"
        />
        <p class="text-xs text-gray-400 mt-1">128 GB / 256 GB 可用</p>
      </div>

      <NButton size="small" @click="showMigrate = true" class="mt-1">
        <template #icon>
          <SwapHorizontalOutline class="w-3.5 h-3.5" />
        </template>
        迁移目录
      </NButton>
    </div>

    <!-- Migrate Modal -->
    <NModal v-model:show="showMigrate" preset="card" title="迁移 Scoop 目录" style="width: 500px">
      <NSpace vertical>
        <p class="text-sm text-gray-500">
          将当前 Scoop 安装目录迁移到新的位置。此操作会复制所有现有数据，并更新系统环境变量。
        </p>
        <NInput v-model:value="newPath" placeholder="例如: D:\Scoop" />
        <NButton type="primary" :loading="settingsStore.loading" @click="migrate" block>
          开始迁移
        </NButton>
      </NSpace>
    </NModal>
  </NCard>
</template>
