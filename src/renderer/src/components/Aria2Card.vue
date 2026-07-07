<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NSwitch, NButton, useMessage } from 'naive-ui'
import { RocketOutline } from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const message = useMessage()

const aria2Enabled = computed(() => settingsStore.aria2Enabled)
const aria2Installed = computed(() => settingsStore.aria2Installed)

async function toggleAria2(enabled: boolean) {
  if (!aria2Installed.value) {
    message.warning('请先安装 Aria2')
    return
  }
  await settingsStore.setAria2Enabled(enabled)
  message.success(enabled ? 'Aria2 已启用' : 'Aria2 已关闭')
}

async function handleInstall() {
  message.info('正在安装 Aria2...')
  await settingsStore.installAria2()
  message.success('Aria2 安装完成')
}
</script>

<template>
  <NCard
    :bordered="false"
    class="glass-card"
    content-class="flex flex-col gap-4 p-5"
  >
    <!-- 标题行 -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <RocketOutline
          class="w-4 h-4"
          :class="aria2Enabled ? 'text-emerald-400' : 'dark:text-slate-300 text-zinc-500'"
        />
        <span class="font-semibold text-sm dark:text-white text-zinc-900">Aria2 加速</span>
      </div>
      <NSwitch
        :value="aria2Enabled"
        @update:value="toggleAria2"
        size="medium"
        :loading="settingsStore.aria2Loading"
        :disabled="!aria2Installed"
      >
        <template #checked>
          <span class="text-xs font-medium">ON</span>
        </template>
        <template #unchecked>
          <span class="text-xs font-medium">OFF</span>
        </template>
      </NSwitch>
    </div>

    <!-- 状态信息 -->
    <div
      class="flex items-center gap-2 p-3 rounded-lg transition-all duration-300"
      :class="aria2Enabled
        ? 'bg-emerald-500/[0.06] border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.08)]'
        : 'dark:bg-white/[0.03] dark:border-white/[0.06] bg-zinc-50 border border-zinc-200'"
    >
      <template v-if="aria2Installed">
        <div class="flex items-center gap-1.5">
          <span
            class="inline-block w-1.5 h-1.5 rounded-full"
            :class="aria2Enabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-400'"
          />
          <span
            class="text-xs font-medium"
            :class="aria2Enabled ? 'text-emerald-400' : 'dark:text-zinc-400 text-zinc-500'"
          >
            {{ aria2Enabled ? '多线程下载已启用' : '多线程下载已关闭' }}
          </span>
        </div>
      </template>
      <template v-else>
        <span class="text-xs dark:text-zinc-400 text-zinc-500">Aria2 未安装</span>
        <button
          @click="handleInstall"
          class="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 dark:bg-white/[0.06] bg-zinc-100 dark:hover:bg-white/[0.12] hover:bg-zinc-200 border dark:border-white/[0.08] border-zinc-300"
          :style="$attrs.style"
        >
          <RocketOutline class="w-3 h-3" />
          一键安装
        </button>
      </template>
    </div>
  </NCard>
</template>

<style scoped>
/* 亮色模式：开关组件适配 */
html:not(.dark) .glass-card :deep(.n-switch) {
  --n-active-color: #10b981;
}
</style>
