<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
} from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'
import { usePackagesStore } from '@/stores/packages'

const settingsStore = useSettingsStore()
const packagesStore = usePackagesStore()
const message = useMessage()

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
  <NCard :bordered="false" class="!rounded-xl glass-card" content-class="flex flex-col !p-5">
    <!-- 卡片标题 -->
    <div class="flex items-center gap-2.5 mb-4 w-full min-w-0">
      <ServerOutline class="w-5 h-5 text-slate-300 flex-shrink-0" />
      <span class="font-semibold text-base text-white whitespace-nowrap flex-shrink-0">存储与环境管理</span>
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
            :color="settingsStore.cacheInfo.files > 10 ? '#f0a020' : '#6B5BED'"
            :gap-offset-degree="0"
            :gap-degree="60"
            :stroke-width="6"
          >
            <span class="text-sm text-white/80 font-medium">{{ settingsStore.cacheInfo.size || 0 }} MB</span>
          </NProgress>
          <span class="text-xs text-slate-400">{{ settingsStore.cacheInfo.files || 0 }} 个缓存文件</span>
        </div>

        <!-- 右侧: 环境信息 -->
        <div class="col-span-8 flex flex-col gap-3">
          <!-- Scoop Root 路径 + 打开按钮 -->
          <div class="flex items-center justify-between group">
            <div class="flex items-center gap-2 min-w-0">
              <FolderOpenOutline class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span class="text-sm text-slate-300 font-medium flex-shrink-0">Root</span>
            </div>
            <div class="flex items-center gap-1.5 min-w-0">
              <span
                class="text-sm text-white/80 truncate max-w-[100px] text-right font-medium"
                :title="settingsStore.scoopEnv.scoop || '使用默认路径'"
              >
                {{ settingsStore.scoopEnv.scoop || '默认' }}
              </span>
              <NTooltip trigger="hover" placement="top">
                <template #trigger>
                  <NButton
                    quaternary
                    size="small"
                    class="!w-6 !h-6 !p-0 !rounded-md flex items-center justify-center"
                    @click="openFolder(settingsStore.scoopEnv.scoop)"
                  >
                    <FolderOpenOutline class="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                  </NButton>
                </template>
                在资源管理器中打开
              </NTooltip>
            </div>
          </div>

          <!-- Global 路径 + 打开按钮 -->
          <div class="flex items-center justify-between group">
            <div class="flex items-center gap-2 min-w-0">
              <GlobeOutline class="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span class="text-sm text-slate-300 font-medium flex-shrink-0">Global</span>
            </div>
            <div class="flex items-center gap-1.5 min-w-0">
              <span
                class="text-sm text-white/80 truncate max-w-[100px] text-right font-medium"
                :title="settingsStore.scoopEnv.global || '未配置原生路径'"
              >
                {{ settingsStore.scoopEnv.global || '未配置' }}
              </span>
              <NTooltip trigger="hover" placement="top">
                <template #trigger>
                  <NButton
                    quaternary
                    size="small"
                    :disabled="!settingsStore.scoopEnv.global"
                    class="!w-6 !h-6 !p-0 !rounded-md flex items-center justify-center"
                    @click="openFolder(settingsStore.scoopEnv.global)"
                  >
                    <FolderOpenOutline class="w-3.5 h-3.5 transition-colors" :class="settingsStore.scoopEnv.global ? 'text-slate-400 group-hover:text-cyan-400' : 'text-slate-600'" />
                  </NButton>
                </template>
                {{ settingsStore.scoopEnv.global ? '在资源管理器中打开' : '未配置全局路径' }}
              </NTooltip>
            </div>
          </div>

          <!-- Aria2 加速状态 + 闭环引导 -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <RocketOutline class="w-3.5 h-3.5 flex-shrink-0" :class="settingsStore.aria2Enabled ? 'text-emerald-400' : 'text-slate-400'" />
              <span class="text-sm font-medium text-slate-300">Aria2 加速</span>
            </div>
            <div class="flex items-center gap-1.5">
              <template v-if="settingsStore.aria2Enabled">
                <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span class="text-sm font-medium text-emerald-400">多线程已开启</span>
              </template>
              <NButton
                v-else
                quaternary
                size="small"
                :loading="settingsStore.loading"
                @click="handleInstallAria2"
                class="!text-xs !h-7 !rounded-md"
                style="color: rgba(148,163,184,0.8); border: 1px dashed rgba(148,163,184,0.3);"
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
          class="!rounded-lg btn-hover-scale"
          style="background: rgba(136,19,55,0.3); color: #fda4af; border: 1px solid rgba(159,68,86,0.4);"
        >
          <template #icon><TrashOutline class="w-3.5 h-3.5" /></template>
          清除缓存
        </NButton>
        <NButton
          size="small"
          dashed
          @click="showMigrate = true"
          class="!rounded-lg btn-hover-scale"
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
          color="#6B5BED"
        />
        <p class="text-xs text-slate-400 mt-1.5">{{ diskInfo }}</p>
      </div>

      <!-- 下半区：Scoop 生态统计微型网格（带独立发光背景） -->
      <div class="grid grid-cols-3 gap-2.5">
        <div class="flex flex-col items-center py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all cursor-default">
          <div class="flex items-center gap-1.5">
            <CubeOutline class="w-4 h-4 text-cyan-400" />
            <span class="text-xl font-extrabold text-cyan-400 leading-none">{{ settingsStore.bucketCount }}</span>
          </div>
          <span class="text-xs text-slate-300 mt-1.5 font-medium">Buckets</span>
        </div>
        <div class="flex flex-col items-center py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all cursor-default">
          <div class="flex items-center gap-1.5">
            <AppsOutline class="w-4 h-4 text-purple-400" />
            <span class="text-xl font-extrabold text-purple-400 leading-none">{{ settingsStore.installedCount }}</span>
          </div>
          <span class="text-xs text-slate-300 mt-1.5 font-medium">Apps</span>
        </div>
        <div class="flex flex-col items-center py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all cursor-default">
          <div class="flex items-center gap-1.5">
            <GlobeOutline class="w-4 h-4 text-violet-400" />
            <span class="text-xl font-extrabold text-violet-400 leading-none">{{ settingsStore.globalCount }}</span>
          </div>
          <span class="text-xs text-slate-300 mt-1.5 font-medium">Global</span>
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
