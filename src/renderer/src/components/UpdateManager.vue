<script setup lang="ts">
import { ref, computed, inject, watch } from 'vue'
import {
  NButton,
  NIcon,
  NModal,
  NProgress,
  useMessage,
} from 'naive-ui'
import {
  RocketOutline,
  CloseOutline,
  DocumentTextOutline,
  RefreshOutline,
} from '@vicons/ionicons5'

const message = useMessage()
const updateInfo = inject<any>('updateInfo')
const showSettings = inject<any>('showSettings')
const suppressUpdateToast = inject<any>('suppressUpdateToast')
const startDownloadUpdate = inject<() => Promise<void>>('startDownloadUpdate')
const quitAndInstallUpdate = inject<(isUpdate?: boolean) => void>('quitAndInstallUpdate')

type BannerState = 'hidden' | 'notified' | 'updating' | 'downloaded'
const showNotesModal = ref(false)
const dismissed = ref(false)

// 下载进度直接取自共享状态机
const downloadProgress = computed(() => updateInfo?.value?.percent ?? 0)

function shouldShow(): BannerState {
  // 设置窗口打开时，所有 App 自更新反馈就地闭环在设置面板内，
  // 右下角 Toast 全程静默（含 downloading/downloaded），杜绝两处进度打架。
  if (showSettings?.value) return 'hidden'
  const phase = updateInfo?.value?.phase
  // 下载完成 → 常驻提示重启，不受 dismiss 影响
  if (phase === 'downloaded') return 'downloaded'
  if (phase === 'downloading') return 'updating'
  if (dismissed.value) return 'hidden'
  // 用户在设置页主动检查更新时，抑制"发现新版本"toast，反馈就地闭环在设置窗口
  if (suppressUpdateToast?.value) return 'hidden'
  if (updateInfo?.value?.hasUpdate) return 'notified'
  return 'hidden'
}

function dismissBanner() {
  dismissed.value = true
}

watch(() => updateInfo?.value?.hasUpdate, (newVal) => {
  if (newVal) dismissed.value = false
})

async function startDownload() {
  if (!updateInfo?.value?.hasUpdate) return
  try {
    await startDownloadUpdate?.()
  } catch (e: any) {
    message.error(e?.message || '更新下载失败，请稍后重试')
  }
}

function installNow() {
  quitAndInstallUpdate?.(true)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="update-popup" mode="out-in">
      <!-- Notified state -->
      <div
        v-if="shouldShow() === 'notified'"
        key="notified"
        class="update-popup"
      >
        <div class="update-popup-content">
          <div class="update-popup-header">
            <NIcon :component="RocketOutline" size="16" class="update-icon" />
            <span class="update-text">
              发现新版本 <strong class="font-mono">{{ updateInfo.version }}</strong>
            </span>
            <NButton
              text
              size="tiny"
              @click="dismissBanner"
              class="update-close-btn"
            >
              <template #icon><NIcon :component="CloseOutline" size="14" /></template>
            </NButton>
          </div>
          <div class="update-popup-actions">
            <NButton
              text
              size="tiny"
              @click="showNotesModal = true"
              class="update-action-btn"
            >
              <template #icon><NIcon :component="DocumentTextOutline" size="12" /></template>
              更新日志
            </NButton>
            <NButton size="tiny" type="primary" @click="startDownload" class="update-primary-btn">
              <template #icon><NIcon :component="RefreshOutline" size="12" /></template>
              立即更新
            </NButton>
          </div>
        </div>
      </div>

      <!-- Downloading state -->
      <div
        v-else-if="shouldShow() === 'updating'"
        key="updating"
        class="update-popup"
      >
        <div class="update-popup-content">
          <div class="update-popup-header">
            <div class="update-spinner" />
            <span class="update-text update-text-downloading">
              下载中...
            </span>
          </div>
          <div class="update-popup-progress">
            <NProgress
              type="line"
              :percentage="downloadProgress"
              :height="4"
              :border-radius="2"
              :show-indicator="false"
              status="info"
            />
          </div>
        </div>
      </div>

      <!-- Downloaded state：下载完成，提示重启安装 -->
      <div
        v-else-if="shouldShow() === 'downloaded'"
        key="downloaded"
        class="update-popup"
      >
        <div class="update-popup-content">
          <div class="update-popup-header">
            <NIcon :component="RocketOutline" size="16" class="update-icon update-icon-success" />
            <span class="update-text update-text-success">
              新版本 <strong class="font-mono">{{ updateInfo.version }}</strong> 已下载完成
            </span>
          </div>
          <div class="update-popup-actions">
            <NButton size="tiny" type="primary" @click="installNow" class="update-primary-btn">
              <template #icon><NIcon :component="RefreshOutline" size="12" /></template>
              重启并安装
            </NButton>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Release Notes Modal -->
    <NModal
      v-model:show="showNotesModal"
      preset="card"
      title="版本更新日志"
      style="width: 480px"
      :closable="true"
      :mask-closable="true"
      :close-on-esc="true"
    >
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <NIcon :component="RocketOutline" size="18" class="text-indigo-400" />
            <span class="text-base font-bold text-white">{{ updateInfo.version }}</span>
          </div>
          <span v-if="updateInfo.releaseDate" class="text-xs text-slate-500">
            {{ new Date(updateInfo.releaseDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) }}
          </span>
        </div>
        <div class="dark:bg-[#0b0c10] bg-gray-100 rounded-lg p-4 border dark:border-white/[0.06] border-black/[0.08] max-h-[320px] overflow-y-auto custom-scrollbar">
          <div class="text-sm dark:text-slate-300 text-gray-700 leading-relaxed space-y-2 whitespace-pre-wrap">
            {{ updateInfo.notes || '暂无更新日志' }}
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <NButton size="small" quaternary @click="showNotesModal = false" class="!rounded-lg">关闭</NButton>
          <NButton
            v-if="updateInfo.phase === 'downloaded'"
            size="small"
            type="primary"
            @click="showNotesModal = false; installNow()"
            class="!rounded-lg"
          >
            <template #icon><NIcon :component="RocketOutline" size="14" /></template>
            立即重启安装
          </NButton>
          <NButton
            v-else-if="updateInfo.phase !== 'downloading'"
            size="small"
            type="primary"
            @click="showNotesModal = false; startDownload()"
            class="!rounded-lg"
          >
            <template #icon><NIcon :component="RefreshOutline" size="14" /></template>
            立即更新
          </NButton>
          <NButton v-else size="small" type="info" disabled class="!rounded-lg">
            下载中
          </NButton>
        </div>
      </div>
    </NModal>
  </Teleport>
</template>

<style scoped>
/* VSCode 风格右下角弹窗 */
.update-popup {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 360px;
  z-index: 9999;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  background-color: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.dark .update-popup {
  background-color: #1e222b;
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.update-popup-content {
  padding: 12px 16px;
}

.update-popup-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.update-popup-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.update-popup-progress {
  margin-top: 10px;
}

/* 图标样式 */
.update-icon {
  color: #7B6FF0;
  flex-shrink: 0;
}

.dark .update-icon {
  color: #9F94F5;
}

.update-icon-success {
  color: #10B981;
}

.dark .update-icon-success {
  color: #34D399;
}

/* 文字样式 */
.update-text {
  flex: 1;
  font-size: 12px;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark .update-text {
  color: #e2e8f0;
}

.update-text-downloading {
  color: #3B82F6;
  font-family: monospace;
}

.dark .update-text-downloading {
  color: #60A5FA;
}

.update-text-success {
  color: #10B981;
}

.dark .update-text-success {
  color: #34D399;
}

/* 关闭按钮 */
.update-close-btn {
  color: #9CA3AF !important;
  transition: color 0.15s ease;
}

.update-close-btn:hover {
  color: #6B7280 !important;
}

.dark .update-close-btn {
  color: #64748B !important;
}

.dark .update-close-btn:hover {
  color: #94A3B8 !important;
}

/* 操作按钮 */
.update-action-btn {
  color: #6B7280 !important;
  transition: color 0.15s ease;
}

.update-action-btn:hover {
  color: #374151 !important;
}

.dark .update-action-btn {
  color: #94A3B8 !important;
}

.dark .update-action-btn:hover {
  color: #e2e8f0 !important;
}

/* 主要操作按钮 */
.update-primary-btn {
  background-color: #7B6FF0;
  color: white !important;
  border: none;
  transition: background-color 0.15s ease;
}

.update-primary-btn:hover {
  background-color: #9F94F5;
}

.dark .update-primary-btn {
  background-color: #7B6FF0;
}

.dark .update-primary-btn:hover {
  background-color: #9F94F5;
}

/* 旋转动画 */
.update-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #3B82F6;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

.dark .update-spinner {
  border-color: #60A5FA;
  border-top-color: transparent;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 过渡动画 */
.update-popup-enter-active,
.update-popup-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.update-popup-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

.update-popup-leave-to {
  opacity: 0;
  transform: translateY(16px);
}
</style>
