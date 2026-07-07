<script setup lang="ts">
import { ref, computed, onMounted, inject, type Ref } from 'vue'
import { NCard, NButton, NProgress, NTooltip, NSpace, NInput, useMessage } from 'naive-ui'
import {
  FolderOpenOutline,
  SwapHorizontalOutline,
  ServerOutline,
  RocketOutline,
  TrashOutline,
  CubeOutline,
  AppsOutline,
  GlobeOutline,
  SparklesOutline,
  CheckmarkCircleOutline,
} from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'
import { usePackagesStore } from '@/stores/packages'

const settingsStore = useSettingsStore()
const packagesStore = usePackagesStore()
const message = useMessage()

// 主题态：由 App.vue provide('isDark') 下发。Vue 属性无法用 dark: 前缀，故进度条颜色走此派生
const isDark = inject<Ref<boolean>>('isDark', ref(true) as unknown as Ref<boolean>)

// 缓存仪表盘颜色：缓存过多亮橙告警；否则跟随明暗（暗=原紫 #6B5BED，亮=高饱和 violet-600 #7C3AED）
const cacheGaugeColor = computed(() =>
  settingsStore.cacheInfo.files > 10 ? '#f0a020' : (isDark.value ? '#6B5BED' : '#7C3AED')
)
// 磁盘线性进度条已用高亮色；rail 底条：暗=原浅白，亮=zinc-200 #E4E4E7 醒目底
const diskBarColor = computed(() => (isDark.value ? '#6B5BED' : '#7C3AED'))
const diskRailColor = computed(() => (isDark.value ? 'rgba(255,255,255,0.06)' : '#E4E4E7'))
// 一键安装按钮（虚线幽灵按钮）：内联 style 无法用 dark: 前缀，故走 isDark 派生。
// 暗=原浅灰蓝；亮=zinc-500 文字 + zinc-300 虚线边框，裸眼可读
const installBtnStyle = computed(() =>
  isDark.value
    ? 'color: rgba(148,163,184,0.8); border: 1px dashed rgba(148,163,184,0.3);'
    : 'color: #71717A; border: 1px dashed #D4D4D8;'
)

const showMigrate = ref(false)
const newPath = ref('')

onMounted(async () => {
  await settingsStore.loadEnv()
  await settingsStore.loadDiskSpace()
  await settingsStore.checkAria2()
  await settingsStore.loadCacheInfo()
  await settingsStore.loadEcoStats()
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

async function openFolder(path: string) {
  if (!path) {
    message.warning('路径未配置')
    return
  }
  await window.scoopAPI.openPath(path)
}

async function clearCache() {
  try {
    await settingsStore.clearCache()
    message.success('缓存已清除')
  } catch (e: any) {
    message.error(e.message || '清除缓存失败')
  }
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

async function handleInstallAria2() {
  message.info('正在安装 Aria2...')
  await settingsStore.installAria2()
  message.success('Aria2 安装完成')
  // Refresh the installed list so aria2 appears in Dashboard
  await packagesStore.loadInstalled()
  await packagesStore.loadUpdatable()
}
</script>

<template>
  <NCard :bordered="false" class="glass-card" content-class="flex flex-col !p-5">
    <!-- 卡片标题 -->
    <div class="flex items-center gap-2.5 mb-4 w-full min-w-0">
      <ServerOutline class="w-5 h-5 dark:text-zinc-400 text-zinc-500 flex-shrink-0" />
      <span class="font-semibold text-[14px] dark:text-zinc-50 text-zinc-900 whitespace-nowrap flex-shrink-0">存储与环境管理</span>
    </div>

    <!-- 主体：紧凑垂直布局 -->
    <div class="flex flex-col gap-4">
      <!-- 上半区：缓存仪表盘 + 环境信息 并排 -->
      <div class="grid grid-cols-12 gap-5 items-start">
        <!-- 左侧: 缓存仪表盘 -->
        <div class="col-span-4 flex flex-col items-center gap-2.5">
          <NProgress
            type="dashboard"
            :percentage="Math.min(settingsStore.cacheInfo.files * 5, 100)"
            :color="cacheGaugeColor"
            :gap-offset-degree="0"
            :gap-degree="60"
            :stroke-width="6"
          >
            <span class="text-[13px] font-mono font-medium dark:text-zinc-300 text-zinc-700">{{ settingsStore.cacheInfo.size || 0 }} MB</span>
          </NProgress>
          <span class="text-[11px] font-medium dark:text-zinc-500 text-zinc-500">{{ settingsStore.cacheInfo.files || 0 }} 个缓存文件</span>
        </div>

        <!-- 右侧: 环境信息 -->
        <div class="col-span-8 flex flex-col gap-3">
          <!-- Scoop Root 路径 + 打开按钮 -->
          <div class="flex items-center justify-between group">
            <div class="flex items-center gap-2 min-w-0">
              <FolderOpenOutline class="w-3.5 h-3.5 dark:text-zinc-500 text-zinc-500 flex-shrink-0" />
              <span class="text-[12px] font-medium dark:text-zinc-300 text-zinc-700 flex-shrink-0">Root</span>
            </div>
            <div class="flex items-center gap-1.5 min-w-0">
              <template v-if="settingsStore.scoopEnv.scoop">
                <CheckmarkCircleOutline class="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <NTooltip trigger="hover" placement="top">
                  <template #trigger>
                    <NButton
                      quaternary
                      size="small"
                      class="!w-6 !h-6 !p-0 !rounded-lg flex items-center justify-center"
                      @click="openFolder(settingsStore.scoopEnv.scoop)"
                    >
                      <FolderOpenOutline class="w-3.5 h-3.5 dark:text-zinc-500 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
                    </NButton>
                  </template>
                  {{ settingsStore.scoopEnv.scoop }}
                </NTooltip>
              </template>
              <span v-else class="text-[12px] font-medium dark:text-zinc-500 text-zinc-500">默认</span>
            </div>
          </div>

          <!-- Global 路径 + 打开按钮 -->
          <div class="flex items-center justify-between group">
            <div class="flex items-center gap-2 min-w-0">
              <GlobeOutline class="w-3.5 h-3.5 dark:text-zinc-500 text-zinc-500 flex-shrink-0" />
              <span class="text-[12px] font-medium dark:text-zinc-300 text-zinc-700 flex-shrink-0">Global</span>
            </div>
            <div class="flex items-center gap-1.5 min-w-0">
              <template v-if="settingsStore.scoopEnv.global">
                <CheckmarkCircleOutline class="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <NTooltip trigger="hover" placement="top">
                  <template #trigger>
                    <NButton
                      quaternary
                      size="small"
                      class="!w-6 !h-6 !p-0 !rounded-lg flex items-center justify-center"
                      @click="openFolder(settingsStore.scoopEnv.global)"
                    >
                      <FolderOpenOutline class="w-3.5 h-3.5 dark:text-zinc-500 text-zinc-500 group-hover:text-cyan-400 transition-colors" />
                    </NButton>
                  </template>
                  {{ settingsStore.scoopEnv.global }}
                </NTooltip>
              </template>
              <span v-else class="text-[12px] font-medium dark:text-zinc-500 text-zinc-500">未配置</span>
            </div>
          </div>

          <!-- Aria2 加速状态 + 闭环引导 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <RocketOutline class="w-3.5 h-3.5 flex-shrink-0" :class="settingsStore.aria2Installed ? 'text-emerald-400' : 'dark:text-zinc-500 text-zinc-500'" />
              <span class="text-[12px] font-medium dark:text-zinc-300 text-zinc-700">Aria2 加速</span>
            </div>
            <div class="flex items-center gap-1.5">
              <template v-if="settingsStore.aria2Installed">
                <span class="inline-block w-2 h-2 rounded-full" :class="settingsStore.aria2Enabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'" />
                <span class="text-[12px] font-medium" :class="settingsStore.aria2Enabled ? 'text-emerald-400' : 'text-zinc-500'">{{ settingsStore.aria2Enabled ? '多线程已开启' : '多线程已关闭' }}</span>
              </template>
              <NButton
                v-else
                quaternary
                size="small"
                :loading="settingsStore.loading"
                @click="handleInstallAria2"
                class="!text-xs !h-7 !rounded-lg"
                :style="installBtnStyle"
              >
                <template #icon><SparklesOutline class="w-3 h-3" /></template>
                一键安装
              </NButton>
            </div>
          </div>
        </div>
      </div>

      <!-- 中间区：两个操作按钮并排 -->
      <div class="grid grid-cols-2 gap-3">
        <NButton
          size="small"
          :loading="settingsStore.loading"
          @click="clearCache"
          :disabled="settingsStore.cacheInfo.files === 0"
          class="!rounded-lg btn-hover-scale w-full"
          style="background: rgba(78,138,100,0.15); color: #4E8A64; border: 1px solid rgba(78,138,100,0.3);"
        >
          <template #icon><TrashOutline class="w-3.5 h-3.5" /></template>
          清除缓存
        </NButton>
        <NButton
          size="small"
          dashed
          @click="showMigrate = true"
          class="!rounded-lg btn-hover-scale w-full"
        >
          <template #icon><SwapHorizontalOutline class="w-3.5 h-3.5" /></template>
          迁移目录
        </NButton>
      </div>

      <!-- 磁盘空间进度条 -->
      <div>
        <NProgress
          type="line"
          :percentage="diskPercent"
          :height="5"
          :border-radius="3"
          :show-indicator="false"
          :color="diskBarColor"
          :rail-color="diskRailColor"
        />
        <p class="text-[11px] dark:font-normal dark:text-zinc-500 font-medium text-zinc-500 mt-1.5">{{ diskInfo }}</p>
      </div>

      <!-- 下半区：Scoop 生态统计微型网格（带独立发光背景） -->
      <div class="grid grid-cols-3 gap-2.5">
        <div class="flex flex-col items-center py-3 rounded-lg dark:bg-white/[0.04] bg-zinc-100 border dark:border-white/[0.08] border-zinc-200 dark:hover:bg-white/[0.07] hover:bg-zinc-200/70 dark:hover:border-white/[0.12] hover:border-zinc-300 transition-all cursor-default">
          <div class="flex items-center gap-1.5">
            <CubeOutline class="w-4 h-4 text-cyan-400" />
            <span class="text-[18px] font-mono font-bold text-cyan-400 leading-none">{{ settingsStore.bucketCount }}</span>
          </div>
          <span class="text-[11px] dark:font-normal font-medium dark:text-zinc-400 text-zinc-600 mt-1.5">Buckets</span>
        </div>
        <div class="flex flex-col items-center py-3 rounded-lg dark:bg-white/[0.04] bg-zinc-100 border dark:border-white/[0.08] border-zinc-200 dark:hover:bg-white/[0.07] hover:bg-zinc-200/70 dark:hover:border-white/[0.12] hover:border-zinc-300 transition-all cursor-default">
          <div class="flex items-center gap-1.5">
            <AppsOutline class="w-4 h-4 text-emerald-500" />
            <span class="text-[18px] font-mono font-bold text-emerald-500 leading-none">{{ settingsStore.installedCount }}</span>
          </div>
          <span class="text-[11px] dark:font-normal font-medium dark:text-zinc-400 text-zinc-600 mt-1.5">Apps</span>
        </div>
        <div class="flex flex-col items-center py-3 rounded-lg dark:bg-white/[0.04] bg-zinc-100 border dark:border-white/[0.08] border-zinc-200 dark:hover:bg-white/[0.07] hover:bg-zinc-200/70 dark:hover:border-white/[0.12] hover:border-zinc-300 transition-all cursor-default">
          <div class="flex items-center gap-1.5">
            <GlobeOutline class="w-4 h-4 text-teal-500" />
            <span class="text-[18px] font-mono font-bold text-teal-500 leading-none">{{ settingsStore.globalCount }}</span>
          </div>
          <span class="text-[11px] dark:font-normal font-medium dark:text-zinc-400 text-zinc-600 mt-1.5">Global</span>
        </div>
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
