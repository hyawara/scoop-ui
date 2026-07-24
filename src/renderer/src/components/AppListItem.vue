<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NCheckbox, NIcon, NPopover, NRadio, NRadioGroup, NText, NTooltip } from 'naive-ui'
import { ArrowUpCircleOutline, DownloadOutline, RefreshOutline, TrashOutline } from '@vicons/ionicons5'

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
  pinned?: boolean
  newVersion?: string
  changedVersion?: string
  active?: boolean
  resettable?: boolean
  resetting?: boolean
  activeVersion?: boolean
  multiVersionFamily?: string | null
  icon?: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle-check', name: string): void
  (e: 'update', pkg: PackageInfo): void
  (e: 'reinstall', pkg: PackageInfo, options?: { useSudo?: boolean; isGlobal?: boolean }): void
  (e: 'uninstall', pkg: PackageInfo, options?: { purge?: boolean }): void
  (e: 'install', name: string, options?: { useSudo?: boolean; isGlobal?: boolean; global?: boolean }): void
  (e: 'select', pkg: PackageInfo): void
  (e: 'show-logs', name: string): void
  (e: 'toggle-pin', name: string): void
  (e: 'reset', name: string): void
}>()

type InstallMode = 'standard' | 'global'
const showInstallPopover = ref(false)
const showReinstallPopover = ref(false)
const showUninstallPopover = ref(false)
const installMode = ref<InstallMode>('standard')
const uninstallPurge = ref(false)

function installOptionsByMode() {
  if (installMode.value === 'global') return { global: true, isGlobal: true }
  return {}
}

function confirmInstall() {
  showInstallPopover.value = false
  emit('install', props.pkg.name, installOptionsByMode())
  installMode.value = 'standard'
}

function confirmReinstall() {
  showReinstallPopover.value = false
  emit('reinstall', props.pkg)
}

function confirmUninstall() {
  showUninstallPopover.value = false
  emit('uninstall', props.pkg, uninstallPurge.value ? { purge: true } : undefined)
  uninstallPurge.value = false
}
</script>

<template>
  <div
    class="group flex items-center h-12 px-4 transition-colors duration-150 border-b dark:border-white/[0.04] border-zinc-200 dark:hover:bg-white/[0.02] hover:bg-zinc-100 cursor-pointer"
    :class="{
      'opacity-40': disabled,
      'dark:bg-white/[0.04] bg-zinc-100': isSelected,
      'is-pinned': pinned,
      'is-active': active,
      'is-updatable': mode === 'updatable' && !active && !pinned,
      'is-active-version': activeVersion && !active,
    }"
    @click="emit('select', pkg)"
  >
    <!-- 复选框 -->
    <div v-if="mode !== 'search'" class="flex-shrink-0 w-6" @click.stop>
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
      <span
        class="text-[12px] font-medium font-mono ml-3 flex-shrink-0 transition-colors"
        :class="newVersion && !active ? 'dark:text-zinc-500 text-zinc-400' : 'text-zinc-400'"
      >{{ pkg.version }}</span>
      <span v-if="pkg.bucket" class="ml-3 px-2 py-0.5 text-xs font-normal border rounded-md font-mono flex-shrink-0 dark:bg-white/[0.04] dark:border-zinc-700/60 dark:text-zinc-400 bg-zinc-100 border-zinc-200 text-zinc-600">{{ pkg.bucket }}</span>
      <span v-if="pkg.global" class="ml-3 px-2 py-0.5 text-xs font-normal border rounded-md font-mono flex-shrink-0 dark:bg-white/[0.04] dark:border-zinc-700/60 dark:text-zinc-400 bg-zinc-100 border-zinc-200 text-zinc-600">Global</span>
      <span v-if="newVersion && !active" class="version-pop ml-3 inline-flex items-center gap-1 font-semibold font-mono flex-shrink-0">
        <span class="dark:text-zinc-500 text-zinc-400">→</span>
        <NText type="warning" class="update-version-text">{{ newVersion }}</NText>
      </span>
      <span v-else-if="changedVersion && !active" class="manifest-changed ml-3 inline-flex items-center gap-1 font-medium font-mono flex-shrink-0">
        <span class="dark:text-zinc-500 text-zinc-400">↝</span>
        <span>{{ changedVersion }}</span>
        <span class="manifest-changed-label">清单变更</span>
      </span>
      <span
        v-if="activeVersion"
        class="ml-3 px-2 py-0.5 text-[11px] font-medium text-cyan-500 font-mono flex-shrink-0 rounded-md bg-cyan-500/10"
      >活动</span>
      <span
        v-if="resettable && multiVersionFamily"
        class="ml-3 text-[10px] font-mono flex-shrink-0 dark:text-violet-400/70 text-violet-600/70"
      >{{ multiVersionFamily }}</span>
      <span v-if="mode === 'search' && isInstalled" class="ml-3 px-2 py-0.5 text-[11px] font-medium dark:text-zinc-500 text-zinc-600 font-mono flex-shrink-0 rounded-md dark:bg-white/[0.04] bg-zinc-100">已安装</span>
    </div>

    <!-- 右侧操作区：常驻显示的统一 28px 图标按钮组 -->
    <div class="flex-shrink-0 ml-3 flex items-center gap-1.5 opacity-80 transition-opacity hover:opacity-100">
      <!-- 1. 更新按钮（统一强制更新） -->
      <NTooltip v-if="mode !== 'search'" trigger="hover">
        <template #trigger>
          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            :class="newVersion && !active
              ? 'text-amber-400 hover:bg-amber-400/10'
              : 'text-zinc-500 hover:text-amber-300 hover:bg-amber-400/10'"
            :disabled="disabled || active"
            :title="newVersion && !active ? '更新至新版本' : '强制更新此应用'"
            :aria-label="newVersion && !active ? '更新至新版本' : '强制更新此应用'"
            @click.stop="emit('update', pkg)"
          >
            <NIcon :component="ArrowUpCircleOutline" size="16" />
          </button>
        </template>
        {{ newVersion && !active ? `更新至 ${newVersion}` : '强制更新此应用' }}
      </NTooltip>

      <!-- 2. 重装按钮：左键气泡确认 -->
      <NPopover
        v-if="mode !== 'search'"
        v-model:show="showReinstallPopover"
        trigger="click"
        placement="bottom-end"
        style="width: 288px; padding: 12px;"
        @click.stop
      >
        <template #trigger>
          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:text-cyan-300 hover:bg-cyan-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="disabled || active"
            title="重装此应用"
            aria-label="重装此应用"
            @click.stop
          >
            <NIcon :component="RefreshOutline" size="16" />
          </button>
        </template>
        <div class="space-y-3">
          <div class="text-xs font-bold dark:text-zinc-200 text-zinc-800">重装 {{ pkg.name }}</div>
          <div class="text-[12px] leading-5 dark:text-zinc-500 text-zinc-500">如果此应用需要管理员权限，请以管理员身份启动 Scoop UI 后再重装。</div>
          <div class="flex justify-end gap-2 pt-2 border-t dark:border-zinc-700/40 border-zinc-200">
            <NButton size="tiny" quaternary @click="showReinstallPopover = false">取消</NButton>
            <NButton size="tiny" type="primary" @click="confirmReinstall">确认重装</NButton>
          </div>
        </div>
      </NPopover>

      <!-- 3. 固定按钮 -->
      <NTooltip v-if="mode !== 'search'" trigger="hover">
        <template #trigger>
          <button
            v-if="pinned"
            type="button"
            class="pin-btn pin-btn--active inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-200 cursor-pointer"
            title="取消固定到顶部"
            aria-label="取消固定到顶部"
            @click.stop="emit('toggle-pin', pkg.name)"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
              <path d="M16 3v2l-1 1v5l3 3v1h-5v6l-1 1-1-1v-6H5v-1l3-3V6L7 5V3h9z"/>
            </svg>
          </button>
          <button
            v-else
            type="button"
            class="pin-btn inline-flex h-7 w-7 items-center justify-center rounded transition-colors duration-200 cursor-pointer text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70"
            title="固定到顶部"
            aria-label="固定到顶部"
            @click.stop="emit('toggle-pin', pkg.name)"
          >
            <svg class="w-3.5 h-3.5 -rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
              <path d="M16 3v2l-1 1v5l3 3v1h-5v6l-1 1-1-1v-6H5v-1l3-3V6L7 5V3h9z"/>
            </svg>
          </button>
        </template>
        {{ pinned ? '取消固定' : '固定到顶部' }}
      </NTooltip>

      <!-- 4. 卸载按钮：左键气泡确认 -->
      <NPopover
        v-if="mode !== 'search'"
        v-model:show="showUninstallPopover"
        trigger="click"
        placement="bottom-end"
        style="width: 288px; padding: 12px;"
        @click.stop
      >
        <template #trigger>
          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:text-red-400 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/30"
            title="卸载此应用"
            aria-label="卸载此应用"
            @click.stop
          >
            <NIcon :component="TrashOutline" size="16" />
          </button>
        </template>
        <div class="space-y-3">
          <div class="text-xs font-bold dark:text-zinc-200 text-zinc-800">确定要卸载 {{ pkg.name }} 吗？</div>
          <NCheckbox v-model:checked="uninstallPurge">清除所有数据与配置文件 (--purge)</NCheckbox>
          <div class="flex justify-end gap-2 pt-2 border-t dark:border-zinc-700/40 border-zinc-200">
            <NButton size="tiny" quaternary @click="showUninstallPopover = false; uninstallPurge = false">取消</NButton>
            <NButton size="tiny" type="error" @click="confirmUninstall">确认卸载</NButton>
          </div>
        </div>
      </NPopover>

      <!-- 搜索模式：安装按钮仍保持常驻，尺寸与语义一致 -->
      <NPopover
        v-if="mode === 'search' && !isInstalled"
        v-model:show="showInstallPopover"
        trigger="click"
        placement="bottom-end"
        style="width: 288px; padding: 12px;"
        @click.stop
      >
        <template #trigger>
          <button
            type="button"
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:text-amber-400 hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
            title="安装"
            aria-label="安装"
            @click.stop
          >
            <NIcon :component="DownloadOutline" size="16" />
          </button>
        </template>
        <div class="space-y-3">
          <div class="text-xs font-bold dark:text-zinc-200 text-zinc-800">安装 {{ pkg.name }} ({{ pkg.version }})</div>
          <NRadioGroup v-model:value="installMode" name="install-mode" size="small">
            <div class="space-y-1.5">
              <NRadio value="standard">标准安装 (Standard)</NRadio>
              <NRadio value="global">🌐 全局安装 (-g)</NRadio>
            </div>
          </NRadioGroup>
          <div class="text-[12px] leading-5 dark:text-zinc-500 text-zinc-500">如果安装需要管理员权限，请以管理员身份启动 Scoop UI 后再安装。</div>
          <div class="flex justify-end gap-2 pt-2 border-t dark:border-zinc-700/40 border-zinc-200">
            <NButton size="tiny" quaternary @click="showInstallPopover = false; installMode = 'standard'">取消</NButton>
            <NButton size="tiny" type="primary" @click="confirmInstall">确认安装</NButton>
          </div>
        </div>
      </NPopover>
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

/* ─── 可更新行：琥珀色轻提示，不盖过置顶/执行中状态 ─── */
.is-updatable {
  position: relative;
  background-color: rgb(245 158 11 / 0.08);
}
.is-updatable:hover {
  background-color: rgb(245 158 11 / 0.12);
}
.is-updatable::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background-color: rgb(245 158 11);
  border-radius: 0 2px 2px 0;
}

/* ─── 图钉按钮：沿用原始扁平图钉 SVG，保证形状不变形 ─── */
.pin-btn {
  position: relative;
}

.pin-btn--active {
  color: var(--app-primary);
  background-color: color-mix(in srgb, var(--app-primary) 14%, transparent);
}

.pin-btn--active:hover {
  background-color: color-mix(in srgb, var(--app-primary) 22%, transparent);
}

.version-pop {
  font-size: var(--app-font-size);
  line-height: 1.5;
  animation: version-pop 420ms ease-out;
}

.update-version-text {
  font-size: var(--app-font-size) !important;
  line-height: 1.5 !important;
  font-family: var(--font-mono) !important;
  font-weight: 600 !important;
}

.manifest-changed {
  font-size: var(--app-font-size);
  line-height: 1.5;
  color: rgb(56 189 248);
}

.manifest-changed-label {
  padding: 0 6px;
  border-radius: 6px;
  color: rgb(125 211 252);
  background-color: rgb(14 165 233 / 0.10);
}

@keyframes version-pop {
  0% {
    transform: translateY(2px);
    opacity: 0;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}

/* ─── 当前活动版本：轻微蓝绿色定位，不抢执行中态的绿色高亮 ─── */
.is-active-version {
  position: relative;
  background-color: rgb(6 182 212 / 0.07);
}
.is-active-version:hover {
  background-color: rgb(6 182 212 / 0.11);
}
.is-active-version::after {
  content: '';
  position: absolute;
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background-color: rgb(6 182 212);
  border-radius: 2px 0 0 2px;
}
</style>
