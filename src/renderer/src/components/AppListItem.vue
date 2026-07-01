<script setup lang="ts">
import { NCheckbox, NButton, NIcon, NSpin } from 'naive-ui'
import { DownloadOutline, TrashOutline } from '@vicons/ionicons5'

interface PackageInfo {
  name: string
  version: string
  bucket?: string
  global?: boolean
}

const props = defineProps<{
  pkg: PackageInfo
  mode?: 'installed' | 'search' | 'updatable'
  checked?: boolean
  disabled?: boolean
  isSelected?: boolean
  isInstalled?: boolean
  newVersion?: string
}>()

const emit = defineEmits<{
  (e: 'toggle-check', name: string): void
  (e: 'update', pkg: PackageInfo): void
  (e: 'uninstall', pkg: PackageInfo): void
  (e: 'install', name: string): void
  (e: 'select', pkg: PackageInfo): void
}>()
</script>

<template>
  <div
    class="group flex items-center gap-3 h-14 px-4 transition-colors duration-150 border-b border-white/[0.04] hover:bg-white/[0.02]"
    :class="{
      'opacity-40 pointer-events-none': disabled,
      'bg-white/[0.04]': isSelected,
      'cursor-pointer': mode === 'search',
    }"
    @click="mode === 'search' && emit('select', pkg)"
  >
    <!-- 复选框（已安装和可更新模式） -->
    <div v-if="mode !== 'search'" class="flex-shrink-0 w-6">
      <NCheckbox
        :checked="checked"
        @update:checked="emit('toggle-check', pkg.name)"
        :disabled="disabled"
      />
    </div>

    <!-- 软件图标（单色中性） -->
    <div class="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
      <span class="text-gray-300 text-sm font-medium font-mono">{{ pkg.name[0].toUpperCase() }}</span>
    </div>

    <!-- 信息区 -->
    <div class="flex-1 min-w-0 flex items-center">
      <span class="font-medium text-base text-white/90 truncate">{{ pkg.name }}</span>
      <span class="text-slate-400 text-sm font-mono ml-3">{{ pkg.version }}</span>
      <!-- Bucket 标签（单色极简） -->
      <span v-if="pkg.bucket" class="ml-3 px-2 py-0.5 text-[13px] border border-white/[0.06] text-gray-400 rounded font-mono">{{ pkg.bucket }}</span>
      <span v-if="pkg.global" class="ml-3 px-2 py-0.5 text-[13px] border border-white/[0.06] text-gray-400 rounded font-mono">Global</span>
      <!-- 更新提示（唯一保留的微光色） -->
      <span v-if="newVersion" class="ml-3 text-amber-500/90 text-sm font-mono">→ {{ newVersion }}</span>
      <!-- 已安装状态（搜索模式，仅已安装时显示） -->
      <span v-if="mode === 'search' && isInstalled" class="ml-3 text-[13px] text-gray-500 font-mono">已安装</span>
    </div>

    <!-- 操作按钮 -->
    <div class="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      <!-- 更新按钮（可更新模式） -->
      <NButton v-if="newVersion" text size="small" class="!text-amber-500/80 hover:!text-amber-400" @click.stop="emit('update', pkg)">
        <template #icon><NIcon :component="DownloadOutline" size="16" /></template>
      </NButton>
      <!-- 卸载按钮（已安装/可更新模式） -->
      <template v-if="mode !== 'search'">
        <NSpin v-if="disabled" size="small" />
        <NButton v-else text size="small" class="!text-gray-500 hover:!text-rose-400" @click.stop="emit('uninstall', pkg)">
          <template #icon><NIcon :component="TrashOutline" size="16" /></template>
        </NButton>
      </template>
      <!-- 安装按钮（搜索模式，未安装时显示） -->
      <NButton v-if="mode === 'search' && !isInstalled" text size="small" class="!text-gray-500 hover:!text-white" @click.stop="emit('install', pkg.name)">
        <template #icon><NIcon :component="DownloadOutline" size="16" /></template>
      </NButton>
    </div>
  </div>
</template>
