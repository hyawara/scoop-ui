<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  NCard,
  NButton,
  NTag,
  NSwitch,
  NIcon,
  NPopconfirm,
  NSkeleton,
  useMessage,
} from 'naive-ui'
import {
  DownloadOutline,
  TrashOutline,
  GlobeOutline,
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import type { InstallOptions } from '@/types'

const props = defineProps<{
  pkg: any
  installed: boolean
  isInstalling?: boolean
}>()

const packagesStore = usePackagesStore()
const message = useMessage()
const detailReady = ref(false)

const installOptions = ref<InstallOptions>({
  global: false,
  skipCheck: false,
  independent: false,
})

watch(() => props.pkg, () => {
  detailReady.value = false
  setTimeout(() => { detailReady.value = true }, 120)
}, { immediate: true })

async function handleInstall() {
  await packagesStore.install(props.pkg.name, installOptions.value)
  message.success(`${props.pkg.name} 安装完成`)
}

async function handleUninstall() {
  await packagesStore.uninstall(props.pkg.name, installOptions.value.global)
  message.success(`${props.pkg.name} 已卸载`)
}

async function handleUpdate() {
  await packagesStore.update(props.pkg.name)
  message.success(`${props.pkg.name} 更新完成`)
}

const manifestJson = computed(() => {
  try {
    return JSON.stringify(props.pkg, null, 2)
  } catch {
    return ''
  }
})
</script>

<template>
  <NCard :bordered="false" class="h-full glass-card" content-class="flex flex-col h-full !p-0">
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <!-- 骨架屏 -->
      <div v-if="!detailReady" class="p-5 space-y-5">
        <div class="flex items-start gap-4">
          <NSkeleton :width="64" :height="64" :border-radius="12" />
          <div class="flex-1 space-y-3">
            <NSkeleton :width="160" :height="20" :border-radius="4" />
            <div class="flex gap-2">
              <NSkeleton :width="64" :height="20" :border-radius="8" />
              <NSkeleton :width="40" :height="20" :border-radius="8" />
            </div>
            <NSkeleton :width="100" :height="14" :border-radius="4" />
          </div>
        </div>
        <NSkeleton :width="'100%'" :height="48" :border-radius="8" />
        <NSkeleton :width="'100%'" :height="120" :border-radius="12" />
        <NSkeleton :width="'100%'" :height="100" :border-radius="12" />
      </div>

      <!-- 实际内容 -->
      <Transition name="fade-in" mode="out-in">
        <div v-if="detailReady" class="p-5">
          <!-- Header -->
          <div class="flex items-start gap-4 mb-5">
            <div
              class="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
              :class="installed
                ? 'bg-gradient-to-br from-green-400 to-emerald-500'
                : 'bg-gradient-to-br from-blue-400 to-purple-500'"
            >
              <span class="text-white text-2xl font-bold uppercase">{{ pkg.name[0] }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3 mb-1">
                <h2 class="text-xl font-bold text-white truncate">{{ pkg.name }}</h2>
                <NTag v-if="installed" size="small" :bordered="false"
                  class="!bg-emerald-500/15 !text-emerald-400">已安装</NTag>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <NTag size="small" :bordered="false" class="dark:!bg-white/[0.06] !bg-black/[0.04] dark:!text-slate-300 !text-gray-600">{{ pkg.version || 'unknown' }}</NTag>
                <NTag v-if="pkg.bucket" size="small" :bordered="false"
                  class="!bg-violet-900/40 !text-violet-300">{{ pkg.bucket }}</NTag>
              </div>
              <div class="flex items-center gap-2 mt-2">
                <NButton
                  v-if="pkg.website"
                  text
                  size="tiny"
                  tag="a"
                  :href="pkg.website"
                  target="_blank"
                  class="!text-slate-400 hover:!text-cyan-400"
                >
                  <template #icon>
                    <NIcon :component="GlobeOutline" size="14" />
                  </template>
                  官方网站
                </NButton>
              </div>
            </div>
          </div>

          <!-- Description -->
          <p class="text-sm text-slate-300 mb-5 leading-relaxed">
            {{ pkg.description || '暂无描述信息' }}
          </p>

          <!-- Advanced Options -->
          <div class="dark:bg-white/[0.03] bg-black/[0.02] border dark:border-white/[0.06] border-black/[0.06] rounded-xl p-4 mb-4 space-y-3">
            <h4 class="text-sm font-semibold text-white mb-3">高级安装选项</h4>
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-300">全局安装 (--global)</span>
              <NSwitch v-model:value="installOptions.global" size="small" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-300">跳过哈希检查 (--skip)</span>
              <NSwitch v-model:value="installOptions.skipCheck" size="small" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-slate-300">独立安装 (--independent)</span>
              <NSwitch v-model:value="installOptions.independent" size="small" />
            </div>
          </div>

          <!-- Manifest preview -->
          <div class="dark:bg-[#090a0d] bg-gray-100 border dark:border-white/[0.06] border-black/[0.08] rounded-xl p-4 mb-4">
            <h4 class="text-sm font-semibold text-white mb-2">Manifest 信息</h4>
            <pre class="text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed text-slate-300">{{ manifestJson }}</pre>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Action Buttons: 行内安装时隐藏整个底部栏 -->
    <div v-if="!isInstalling" class="p-4 border-t dark:border-white/[0.06] border-black/[0.06] flex gap-3">
      <NButton
        v-if="!installed"
        type="primary"
        size="large"
        :loading="packagesStore.loading"
        @click="handleInstall"
        class="flex-1"
        :disabled="packagesStore.loading"
      >
        <template #icon>
          <NIcon :component="DownloadOutline" size="18" />
        </template>
        安装 {{ pkg.name }}
      </NButton>

      <template v-else>
        <NButton
          v-if="pkg.updatable"
          type="warning"
          size="large"
          @click="handleUpdate"
          class="flex-1"
        >
          更新
        </NButton>

        <NPopconfirm @positive-click="handleUninstall">
          <template #trigger>
            <NButton type="error" size="large" class="flex-1">
              <template #icon>
                <NIcon :component="TrashOutline" size="18" />
              </template>
              卸载
            </NButton>
          </template>
          确认卸载 {{ pkg.name }}？
        </NPopconfirm>
      </template>
    </div>

    <!-- 行内安装中：底部显示微型状态条 -->
    <div v-else class="px-4 py-3 border-t dark:border-white/[0.06] border-black/[0.06] flex items-center gap-2">
      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <span class="text-xs text-slate-400 font-mono">正在行内安装 {{ pkg.name }}...</span>
    </div>
  </NCard>
</template>

<style scoped>
.fade-in-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fade-in-leave-active {
  transition: opacity 0.15s ease;
}
.fade-in-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-in-leave-to {
  opacity: 0;
}
</style>
