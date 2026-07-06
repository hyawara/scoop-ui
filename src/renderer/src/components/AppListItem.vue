<script setup lang="ts">
import { computed } from 'vue'
import { NCheckbox, NButton, NIcon } from 'naive-ui'
import { DownloadOutline, TrashOutline, TerminalOutline } from '@vicons/ionicons5'

interface PackageInfo {
  name: string
  version: string
  bucket?: string
  global?: boolean
}

export interface ProgressInfo {
  phase: 'downloading' | 'installing' | 'success'
  percent: number
}

const props = defineProps<{
  pkg: PackageInfo
  mode?: 'installed' | 'search' | 'updatable'
  checked?: boolean
  disabled?: boolean
  isSelected?: boolean
  isInstalled?: boolean
  newVersion?: string
  progress?: ProgressInfo
  icon?: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-check', name: string): void
  (e: 'update', pkg: PackageInfo): void
  (e: 'uninstall', pkg: PackageInfo): void
  (e: 'install', name: string): void
  (e: 'select', pkg: PackageInfo): void
  (e: 'show-logs', name: string): void
}>()

const isProcessing = computed(() => !!props.progress && props.progress.phase !== 'success')

// SVG 圆环参数
const RING_RADIUS = 8
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const ringDashoffset = computed(() => {
  if (!props.progress) return RING_CIRCUMFERENCE
  return RING_CIRCUMFERENCE * (1 - props.progress.percent / 100)
})
</script>

<template>
  <div
    class="group flex items-center h-12 px-4 transition-colors duration-150 border-b dark:border-white/[0.04] border-black/[0.06] dark:hover:bg-white/[0.02] hover:bg-black/[0.02]"
    :class="{
      'opacity-40': disabled,
      'dark:bg-white/[0.04] bg-black/[0.04]': isSelected,
      'cursor-pointer': mode === 'search',
    }"
    @click="mode === 'search' && emit('select', pkg)"
  >
    <!-- 复选框 -->
    <div v-if="mode !== 'search'" class="flex-shrink-0 w-6">
      <NCheckbox
        :checked="checked"
        @update:checked="emit('toggle-check', pkg.name)"
        :disabled="disabled || isProcessing"
      />
    </div>

    <!-- 软件图标 -->
    <div class="w-9 h-9 rounded-lg dark:bg-white/[0.04] bg-black/[0.03] flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img
        v-if="icon"
        :src="icon"
        :alt="pkg.name"
        class="w-full h-full object-contain"
      />
      <span v-else class="text-gray-400 text-sm font-medium font-mono">{{ pkg.name[0].toUpperCase() }}</span>
    </div>

    <!-- 信息区：名称 + 版本 + 标签，永不换行 -->
    <div class="flex-1 min-w-0 flex items-center ml-2.5 overflow-hidden">
      <span class="font-medium text-[14px] dark:text-zinc-50 text-gray-800 truncate flex-shrink-0">{{ pkg.name }}</span>
      <span class="text-zinc-400 text-[12px] font-normal font-mono ml-3 flex-shrink-0">{{ pkg.version }}</span>
      <span v-if="pkg.bucket" class="ml-3 px-2 py-0.5 text-[11px] font-normal border dark:border-white/[0.06] border-black/[0.08] dark:text-zinc-400 text-gray-500 rounded-md font-mono flex-shrink-0">{{ pkg.bucket }}</span>
      <span v-if="pkg.global" class="ml-3 px-2 py-0.5 text-[11px] font-normal border dark:border-white/[0.06] border-black/[0.08] dark:text-zinc-400 text-gray-500 rounded-md font-mono flex-shrink-0">Global</span>
      <span v-if="newVersion && !progress" class="ml-3 text-amber-500/80 text-[12px] font-semibold font-mono flex-shrink-0">→ {{ newVersion }}</span>
      <span v-if="mode === 'search' && isInstalled" class="ml-3 px-2 py-0.5 text-[11px] font-normal dark:text-zinc-500 text-gray-500 font-mono flex-shrink-0 rounded-md dark:bg-white/[0.04] bg-black/[0.03]">已安装</span>
    </div>

    <!-- 右侧操作区：固定宽度，绝对垂直居中 -->
    <div class="flex-shrink-0 w-[100px] flex items-center self-center justify-end gap-2.5">
      <!-- ═══ 状态 1：静止/准备态 ═══ -->
      <template v-if="!progress || progress.phase === 'success'">
        <!-- 更新按钮 -->
        <NButton
          v-if="newVersion && !progress"
          text size="small"
          class="!text-amber-500/80 hover:!text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          @click.stop="emit('update', pkg)"
        >
          <template #icon><NIcon :component="DownloadOutline" size="15" /></template>
        </NButton>
        <!-- 卸载按钮 -->
        <template v-if="mode !== 'search'">
          <NButton
            v-if="!newVersion && !progress"
            text size="small"
            class="!text-gray-600 hover:!text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            @click.stop="emit('uninstall', pkg)"
          >
            <template #icon><NIcon :component="TrashOutline" size="15" /></template>
          </NButton>
        </template>
        <!-- 安装按钮（搜索模式） -->
        <NButton
          v-if="mode === 'search' && !isInstalled && !progress"
          text size="small"
          class="!text-gray-600 dark:hover:!text-white hover:!text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          @click.stop="emit('install', pkg.name)"
        >
          <template #icon><NIcon :component="DownloadOutline" size="15" /></template>
        </NButton>
      </template>

      <!-- ═══ 状态 2：正在执行态 ═══ -->
      <template v-else>
        <!-- 脉冲圆圈 + 环形进度 -->
        <div class="relative flex items-center justify-center w-6 h-6 flex-shrink-0">
          <!-- 外圈脉冲呼吸光环 -->
          <span
            class="absolute inset-0 rounded-full animate-ping"
            :class="progress.phase === 'downloading' ? 'bg-emerald-500/20' : 'bg-indigo-500/20'"
            style="animation-duration: 1.5s;"
          />
          <!-- SVG 环形进度 -->
          <svg class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 20 20">
            <circle cx="10" cy="10" :r="RING_RADIUS" fill="none" stroke-width="2" class="stroke-white/[0.06]" />
            <circle
              cx="10" cy="10" :r="RING_RADIUS" fill="none" stroke-width="2" stroke-linecap="round"
              :stroke-dasharray="RING_CIRCUMFERENCE"
              :stroke-dashoffset="progress.phase === 'installing' ? 0 : ringDashoffset"
              class="transition-all duration-300"
              :class="progress.phase === 'downloading' ? 'stroke-emerald-500' : 'stroke-indigo-400'"
            />
          </svg>
          <!-- 中心数字 / 菊花 -->
          <span
            v-if="progress.phase === 'downloading'"
            class="relative z-10 text-[10px] font-mono font-semibold text-emerald-400 tabular-nums leading-none"
          >{{ progress.percent }}</span>
          <span
            v-else
            class="relative z-10 w-3 h-3 border-[1.5px] border-t-transparent rounded-full animate-spin"
            :class="progress.phase === 'installing' ? 'border-indigo-400' : 'border-emerald-400'"
          />
        </div>
        <!-- 日志入口 -->
        <button
          class="flex items-center justify-center w-6 h-6 rounded text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0"
          title="查看终端日志"
          @click.stop="emit('show-logs', pkg.name)"
        >
          <NIcon :component="TerminalOutline" :size="13" />
        </button>
      </template>
    </div>
  </div>
</template>
