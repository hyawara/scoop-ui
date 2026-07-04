<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, watch } from 'vue'
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
const appDownloading = inject<any>('appDownloading')

type BannerState = 'hidden' | 'notified' | 'updating'
const state = ref<BannerState>('hidden')
const downloadProgress = ref(0)
const showNotesModal = ref(false)
const dismissed = ref(false)

const BANNER_HEIGHT = 'h-10'

function shouldShow(): BannerState {
  if (dismissed.value && !appDownloading?.value) return 'hidden'
  if (showSettings?.value && !appDownloading?.value) return 'hidden'
  if (appDownloading?.value) return 'updating'
  if (state.value === 'updating') return 'updating'
  if (updateInfo?.value?.hasUpdate) return 'notified'
  return 'hidden'
}

function dismissBanner() {
  dismissed.value = true
  state.value = 'hidden'
}

watch(() => updateInfo?.value?.hasUpdate, (newVal) => {
  if (newVal) dismissed.value = false
})

onMounted(() => {
  window.scoopAPI.onUpdateProgress((data: { percent: number }) => {
    downloadProgress.value = data.percent
  })
})

onUnmounted(() => {
  window.scoopAPI.removeUpdateProgressListener()
})

async function startDownload() {
  const dlUrl = updateInfo?.value?.zipUrl || updateInfo?.value?.downloadUrl
  if (!dlUrl) return
  state.value = 'updating'
  downloadProgress.value = 0
  try {
    await window.scoopAPI.downloadUpdate(dlUrl)
    state.value = 'hidden'
    await new Promise(r => setTimeout(r, 1500))
    window.scoopAPI.startAppUpgrade()
  } catch (e: any) {
    state.value = 'hidden'
    message.error(e?.message || '更新下载失败，请稍后重试')
  }
}
</script>

<template>
  <Transition name="banner-slide" mode="out-in">
    <!-- Notified state -->
    <div
      v-if="shouldShow() === 'notified'"
      key="notified"
      class="w-full rounded-lg flex items-center gap-3 px-3 bg-indigo-950/40 border border-indigo-500/30"
      :class="BANNER_HEIGHT"
    >
      <NIcon :component="RocketOutline" size="16" class="text-indigo-400 flex-shrink-0" />
      <span class="text-xs text-indigo-200 flex-1 truncate">
        发现新版本 <strong class="font-mono">v{{ updateInfo.version }}</strong>
      </span>
      <NButton
        text
        size="tiny"
        @click="showNotesModal = true"
        class="!text-indigo-300 hover:!text-indigo-200 !rounded-md"
      >
        <template #icon><NIcon :component="DocumentTextOutline" size="12" /></template>
        更新日志
      </NButton>
      <NButton size="tiny" type="primary" secondary @click="startDownload" class="!rounded-md">
        <template #icon><NIcon :component="RefreshOutline" size="12" /></template>
        立即更新
      </NButton>
      <NButton
        text
        size="tiny"
        @click="dismissBanner"
        class="!text-slate-400 hover:!text-slate-200 !rounded-md"
      >
        <template #icon><NIcon :component="CloseOutline" size="14" /></template>
      </NButton>
    </div>

    <!-- Downloading state -->
    <div
      v-else-if="shouldShow() === 'updating'"
      key="updating"
      class="w-full rounded-lg flex items-center gap-3 px-3 bg-blue-950/40 border border-blue-500/20"
      :class="BANNER_HEIGHT"
    >
      <div class="w-3.5 h-3.5 border-2 border-t-transparent border-blue-400 rounded-full animate-spin flex-shrink-0" />
      <span class="text-xs text-blue-200 font-mono flex-shrink-0">
        下载中... {{ downloadProgress }}%
      </span>
      <div class="flex-1 min-w-0">
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
          <span class="text-base font-bold text-white">v{{ updateInfo.version }}</span>
        </div>
        <span v-if="updateInfo.pubDate" class="text-xs text-slate-500">
          {{ new Date(updateInfo.pubDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) }}
        </span>
      </div>
      <div class="dark:bg-[#0b0c10] bg-gray-100 rounded-xl p-4 border dark:border-white/[0.06] border-black/[0.08] max-h-[320px] overflow-y-auto custom-scrollbar">
        <div class="text-sm dark:text-slate-300 text-gray-700 leading-relaxed space-y-2 whitespace-pre-wrap">
          {{ updateInfo.notes || '暂无更新日志' }}
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <NButton size="small" quaternary @click="showNotesModal = false" class="!rounded-lg">关闭</NButton>
        <NButton
          v-if="state !== 'updating'"
          size="small"
          type="primary"
          @click="showNotesModal = false; startDownload()"
          class="!rounded-lg"
        >
          <template #icon><NIcon :component="RefreshOutline" size="14" /></template>
          立即更新
        </NButton>
        <NButton v-else size="small" type="info" disabled class="!rounded-lg">
          下载中 {{ downloadProgress }}%
        </NButton>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.banner-slide-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.banner-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
