<script setup lang="ts">
import { computed } from 'vue'
import { NCheckbox, NButton, NIcon } from 'naive-ui'
import { DownloadOutline, TrashOutline, TerminalOutline, TimeOutline, CheckmarkCircle, CloseCircle, ArrowUpCircleOutline } from '@vicons/ionicons5'

interface PackageInfo {
  name: string
  version: string
  bucket?: string
  global?: boolean
}

/**
 * 行内任务队列状态机相位（与 usePackageProgress 的 PackagePhase 对齐）：
 * queued 排队 · downloading 下载 · installing 安装 · success 成功 · error 失败
 */
export interface ProgressInfo {
  phase: 'queued' | 'downloading' | 'installing' | 'success' | 'error'
  percent: number
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
  (e: 'toggle-pin', name: string): void
}>()

// 活跃执行中（queued/downloading/installing）：锁定复选框，避免中途改选
const isProcessing = computed(() =>
  !!props.progress &&
  (props.progress.phase === 'queued' ||
    props.progress.phase === 'downloading' ||
    props.progress.phase === 'installing')
)

// 相位便捷判断（模板 v-if 分支用）
const isQueued = computed(() => props.progress?.phase === 'queued')
const isDownloading = computed(() => props.progress?.phase === 'downloading')
const isInstalling = computed(() => props.progress?.phase === 'installing')
const isSuccess = computed(() => props.progress?.phase === 'success')
const isError = computed(() => props.progress?.phase === 'error')
// 处于任意任务态（含终态 success/error），右侧操作区切换到「任务视图」
const inTaskView = computed(() => !!props.progress)

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
    class="group flex items-center h-12 px-4 transition-colors duration-150 border-b dark:border-white/[0.04] border-zinc-200 dark:hover:bg-white/[0.02] hover:bg-zinc-100"
    :class="{
      'opacity-40': disabled,
      'dark:bg-white/[0.04] bg-zinc-100': isSelected,
      'cursor-pointer': mode === 'search',
      'is-pinned': pinned,
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
    <div class="w-9 h-9 rounded-lg dark:bg-white/[0.04] bg-zinc-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
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
      <span v-if="newVersion && !progress" class="ml-3 text-amber-400 text-[12px] font-semibold font-mono flex-shrink-0">→ {{ newVersion }}</span>
      <span v-if="mode === 'search' && isInstalled" class="ml-3 px-2 py-0.5 text-[11px] font-medium dark:text-zinc-500 text-zinc-600 font-mono flex-shrink-0 rounded-md dark:bg-white/[0.04] bg-zinc-100">已安装</span>
    </div>

    <!-- 右侧操作区：固定宽度，绝对垂直居中。四大状态平滑切换 -->
    <div class="flex-shrink-0 flex items-center self-center justify-end gap-1.5">
      <Transition name="task-fade" mode="out-in">
        <!-- ═══ 状态 A：idle 静止/准备态（无任何进度） ═══ -->
        <div v-if="!inTaskView" key="idle" class="flex items-center gap-1.5">
          <!-- 更新按钮（有新版本时常驻入口，Hover 显现） -->
          <NButton
            v-if="newVersion"
            text size="small"
            class="!text-amber-500/80 hover:!text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            title="更新到新版本"
            @click.stop="emit('update', pkg)"
          >
            <template #icon><NIcon :component="ArrowUpCircleOutline" size="16" /></template>
          </NButton>
          <!-- 置顶按钮 -->
          <template v-if="mode !== 'search'">
            <button
              class="pin-btn flex items-center justify-center w-5 h-5 rounded transition-all duration-150"
              :class="pinned
                ? 'is-pinned-btn'
                : 'text-zinc-600 dark:text-zinc-600 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] opacity-0 group-hover:opacity-100'"
              :title="pinned ? '取消置顶' : '置顶'"
              @click.stop="emit('toggle-pin', pkg.name)"
            >
              <!-- 已置顶：实心图钉，正立高亮 -->
              <svg v-if="pinned" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M16 3v2l-1 1v5l3 3v1h-5v6l-1 1-1-1v-6H5v-1l3-3V6L7 5V3h9z"/>
              </svg>
              <!-- 未置顶：同款图钉线框，微倾斜 -->
              <svg v-else class="w-3.5 h-3.5 -rotate-45" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">
                <path d="M16 3v2l-1 1v5l3 3v1h-5v6l-1 1-1-1v-6H5v-1l3-3V6L7 5V3h9z"/>
              </svg>
            </button>
          </template>
          <!-- 卸载按钮 -->
          <template v-if="mode !== 'search'">
            <NButton
              text size="small"
              class="!text-gray-600 hover:!text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              title="卸载"
              @click.stop="emit('uninstall', pkg)"
            >
              <template #icon><NIcon :component="TrashOutline" size="15" /></template>
            </NButton>
          </template>
          <!-- 安装按钮（搜索模式） -->
          <NButton
            v-if="mode === 'search' && !isInstalled"
            text size="small"
            class="!text-gray-600 dark:hover:!text-white hover:!text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            title="安装"
            @click.stop="emit('install', pkg.name)"
          >
            <template #icon><NIcon :component="DownloadOutline" size="15" /></template>
          </NButton>
        </div>

        <!-- ═══ 状态 B：queued 排队等待态 ═══ -->
        <div v-else-if="isQueued" key="queued" class="flex items-center gap-1.5 pr-0.5">
          <NIcon :component="TimeOutline" size="15" class="text-zinc-400 dark:text-zinc-500 animate-pulse" />
          <span class="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 select-none">等待中</span>
        </div>

        <!-- ═══ 状态 C：processing 进行态（downloading / installing） ═══ -->
        <div v-else-if="isDownloading || isInstalling" key="processing" class="flex items-center gap-1.5">
          <!-- 脉冲圆圈 + 环形进度 -->
          <div class="relative flex items-center justify-center w-6 h-6 flex-shrink-0">
            <!-- 外圈脉冲呼吸光环 -->
            <span
              class="absolute inset-0 rounded-full animate-ping"
              :class="isDownloading ? 'bg-emerald-500/20' : 'bg-indigo-500/20'"
              style="animation-duration: 1.5s;"
            />
            <!-- SVG 环形进度 -->
            <svg class="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 20 20">
              <circle cx="10" cy="10" :r="RING_RADIUS" fill="none" stroke-width="2" class="dark:stroke-white/[0.06] stroke-zinc-200" />
              <circle
                cx="10" cy="10" :r="RING_RADIUS" fill="none" stroke-width="2" stroke-linecap="round"
                :stroke-dasharray="RING_CIRCUMFERENCE"
                :stroke-dashoffset="isInstalling ? 0 : ringDashoffset"
                class="transition-all duration-300"
                :class="isDownloading ? 'stroke-emerald-500' : 'stroke-indigo-400'"
              />
            </svg>
            <!-- 中心数字 / 菊花 -->
            <span
              v-if="isDownloading"
              class="relative z-10 text-[10px] font-mono font-semibold text-emerald-400 tabular-nums leading-none"
            >{{ progress!.percent }}</span>
            <span
              v-else
              class="relative z-10 w-3 h-3 border-[1.5px] border-t-transparent rounded-full animate-spin border-indigo-400"
            />
          </div>
          <!-- 日志入口 -->
          <button
            class="flex items-center justify-center w-6 h-6 rounded dark:text-gray-600 dark:hover:text-gray-300 text-zinc-500 hover:text-zinc-700 transition-colors flex-shrink-0"
            title="查看终端日志"
            @click.stop="emit('show-logs', pkg.name)"
          >
            <NIcon :component="TerminalOutline" :size="13" />
          </button>
        </div>

        <!-- ═══ 状态 D：success 成功态（绿色勾选徽章，2 秒后归档） ═══ -->
        <div v-else-if="isSuccess" key="success" class="flex items-center gap-1.5 pr-0.5">
          <NIcon :component="CheckmarkCircle" size="18" class="text-emerald-500 task-badge-pop" />
          <span class="text-[11px] font-medium text-emerald-500 select-none">已完成</span>
        </div>

        <!-- ═══ 状态 E：error 失败态（红色徽章，3 秒后归档） ═══ -->
        <div v-else key="error" class="flex items-center gap-1.5 pr-0.5">
          <NIcon :component="CloseCircle" size="18" class="text-rose-500 task-badge-pop" />
          <span class="text-[11px] font-medium text-rose-500 select-none">失败</span>
        </div>
      </Transition>
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

/* ─── 任务态切换：四态之间平滑淡入淡出（out-in 模式，先出后进不重叠） ─── */
.task-fade-enter-active,
.task-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.task-fade-enter-from {
  opacity: 0;
  transform: translateX(6px);
}
.task-fade-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

/* ─── 成功/失败徽章：弹入动效（回弹缩放，给足正反馈） ─── */
.task-badge-pop {
  animation: badge-pop 0.34s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes badge-pop {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  60% {
    transform: scale(1.15);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
