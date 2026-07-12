<script setup lang="ts">
import { NCheckbox, NButton, NIcon, NPopconfirm } from 'naive-ui'
import { DownloadOutline, TrashOutline, ArrowUpCircleOutline } from '@vicons/ionicons5'

interface PackageInfo {
  name: string
  version: string
  bucket?: string
  global?: boolean
}

defineProps<{
  pkg: PackageInfo
  mode?: 'installed' | 'search' | 'updatable'
  checked?: boolean
  disabled?: boolean
  isSelected?: boolean
  isInstalled?: boolean
  pinned?: boolean
  newVersion?: string
  active?: boolean
  icon?: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-check', name: string): void
  (e: 'update', pkg: PackageInfo): void
  (e: 'uninstall', pkg: PackageInfo): void
  (e: 'install', name: string): void
  (e: 'select', pkg: PackageInfo): void
  (e: 'show-logs', name: string): void
  (e: 'toggle-pin', name: string): void
}>()
</script>

<template>
  <div
    class="group flex items-center h-12 px-4 transition-colors duration-150 border-b dark:border-white/[0.04] border-zinc-200 dark:hover:bg-white/[0.02] hover:bg-zinc-100"
    :class="{
      'opacity-40': disabled,
      'dark:bg-white/[0.04] bg-zinc-100': isSelected,
      'cursor-pointer': mode === 'search',
      'is-pinned': pinned,
      'is-active': active,
    }"
    @click="mode === 'search' && emit('select', pkg)"
  >
    <!-- 复选框 -->
    <div v-if="mode !== 'search'" class="flex-shrink-0 w-6">
      <NCheckbox
        :checked="checked"
        @update:checked="emit('toggle-check', pkg.name)"
        :disabled="disabled || active"
      />
    </div>

    <!-- 软件图标 -->
    <div class="relative w-9 h-9 rounded-lg dark:bg-white/[0.04] bg-zinc-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
      <img
        v-if="icon"
        :src="icon"
        :alt="pkg.name"
        class="w-full h-full object-contain"
      />
      <span v-else class="text-zinc-500 text-sm font-medium font-mono">{{ pkg.name[0].toUpperCase() }}</span>
    </div>

    <!-- 信息区：名称 + 版本 + 标签，永不换行，弹性自适应 -->
    <div class="flex-1 min-w-0 flex items-center flex-nowrap ml-2.5 overflow-hidden">
      <span class="font-semibold text-sm dark:text-zinc-50 text-zinc-900 truncate flex-shrink-0">{{ pkg.name }}</span>
      <span class="text-zinc-400 text-[12px] font-medium font-mono ml-3 flex-shrink-0">{{ pkg.version }}</span>
      <span v-if="pkg.bucket" class="ml-3 px-2 py-0.5 text-xs font-normal border rounded-md font-mono flex-shrink-0 dark:bg-white/[0.04] dark:border-zinc-700/60 dark:text-zinc-400 bg-zinc-100 border-zinc-200 text-zinc-600">{{ pkg.bucket }}</span>
      <span v-if="pkg.global" class="ml-3 px-2 py-0.5 text-xs font-normal border rounded-md font-mono flex-shrink-0 dark:bg-white/[0.04] dark:border-zinc-700/60 dark:text-zinc-400 bg-zinc-100 border-zinc-200 text-zinc-600">Global</span>
      <span v-if="newVersion && !active" class="ml-3 text-amber-400 text-[12px] font-semibold font-mono flex-shrink-0">→ {{ newVersion }}</span>
      <span v-if="mode === 'search' && isInstalled" class="ml-3 px-2 py-0.5 text-[11px] font-medium dark:text-zinc-500 text-zinc-600 font-mono flex-shrink-0 rounded-md dark:bg-white/[0.04] bg-zinc-100">已安装</span>
    </div>

    <!-- 右侧操作区：固定宽度，绝对垂直居中 -->
    <div class="flex-shrink-0 flex items-center self-center justify-end gap-1.5">
      <!-- 激活态：极简「执行中」标签，不显示任何按钮 -->
      <span
        v-if="active"
        class="text-[11px] font-medium text-emerald-500 select-none tracking-wide"
      >执行中</span>

      <!-- idle 静止态：操作按钮组 -->
      <div v-else class="flex items-center gap-1.5">
        <!-- 更新按钮：有新版本时常驻高亮显现（琥珀色引导暗示） -->
        <NButton
          v-if="newVersion"
          text size="small"
          class="!text-amber-500 hover:!text-amber-400 transition-colors duration-200 cursor-pointer"
          title="更新到新版本"
          @click.stop="emit('update', pkg)"
        >
          <template #icon><NIcon :component="ArrowUpCircleOutline" size="16" /></template>
        </NButton>
        <!-- 置顶按钮：静默常驻低亮，Hover 高亮 -->
        <template v-if="mode !== 'search'">
          <button
            v-if="pinned"
            class="pin-btn flex items-center justify-center w-5 h-5 rounded transition-colors duration-200 cursor-pointer"
            title="取消置顶"
            @click.stop="emit('toggle-pin', pkg.name)"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M16 3v2l-1 1v5l3 3v1h-5v6l-1 1-1-1v-6H5v-1l3-3V6L7 5V3h9z"/>
            </svg>
          </button>
          <button
            v-else
            class="pin-btn flex items-center justify-center w-5 h-5 rounded transition-colors duration-200 dark:text-zinc-600 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] cursor-pointer"
            title="置顶"
            @click.stop="emit('toggle-pin', pkg.name)"
          >
            <svg class="w-3.5 h-3.5 -rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
              <path d="M16 3v2l-1 1v5l3 3v1h-5v6l-1 1-1-1v-6H5v-1l3-3V6L7 5V3h9z"/>
            </svg>
          </button>
        </template>
        <!-- 卸载按钮：静默常驻低亮，Hover 变红，带 NPopconfirm 二次确认 -->
        <template v-if="mode !== 'search'">
          <NPopconfirm
            @positive-click.stop="emit('uninstall', pkg)"
            :show-icon="false"
          >
            <template #trigger>
              <NButton
                text size="small"
                class="!text-zinc-500 dark:!text-zinc-600 hover:!text-rose-400 dark:hover:!text-rose-400 transition-colors duration-200 cursor-pointer"
                title="卸载"
                @click.stop
              >
                <template #icon><NIcon :component="TrashOutline" size="15" /></template>
              </NButton>
            </template>
            <span class="text-[13px]">确定要完全卸载 <strong>{{ pkg.name }}</strong> 吗？</span>
          </NPopconfirm>
        </template>
        <!-- 安装按钮（搜索模式）：静默常驻低亮，Hover 高亮 -->
        <NButton
          v-if="mode === 'search' && !isInstalled"
          text size="small"
          class="!text-zinc-500 dark:!text-zinc-600 hover:!text-zinc-800 dark:hover:!text-white transition-colors duration-200 cursor-pointer"
          title="安装"
          @click.stop="emit('install', pkg.name)"
        >
          <template #icon><NIcon :component="DownloadOutline" size="15" /></template>
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ─── 置顶行：去背景平铺，仅左侧主题色条 + 极弱主题染色 ─── */
.is-pinned {
  position: relative;
  /* 极淡的主题色染底，暗色不突兀、亮色不刺眼 */
  background-color: color-mix(in srgb, var(--app-primary) 5%, transparent);
}
.is-pinned::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: var(--app-primary);
  border-radius: 0 2px 2px 0;
}

/* ─── 已置顶图钉：跟随全局主题色高亮 ─── */
.is-pinned-btn {
  color: var(--app-primary);
  background-color: color-mix(in srgb, var(--app-primary) 14%, transparent);
}
.is-pinned-btn:hover {
  background-color: color-mix(in srgb, var(--app-primary) 22%, transparent);
}

/* ─── 当前激活行：淡淡的翠色半透明染底 + 左侧翠色引导条 ─── */
.is-active {
  position: relative;
  background-color: rgb(16 185 129 / 0.10);
}
.is-active:hover {
  background-color: rgb(16 185 129 / 0.14);
}
.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background-color: rgb(16 185 129);
  border-radius: 0 2px 2px 0;
}
</style>
