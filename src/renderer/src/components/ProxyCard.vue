<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NCard, NSelect, NInput, NSwitch, useMessage } from 'naive-ui'
import { GlobeOutline } from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const message = useMessage()

const proxyProtocol = ref<'http' | 'socks5'>('http')
const proxyHost = ref('127.0.0.1')
const proxyPort = ref('7890')
const proxyEnabled = computed(() => settingsStore.proxy?.enabled ?? false)

watch(() => settingsStore.proxy, (val) => {
  if (val?.address) {
    const isSocks5 = val.address.startsWith('socks5://')
    const addr = isSocks5 ? val.address.replace('socks5://', '') : val.address
    const parts = addr.split(':')
    proxyHost.value = parts[0] || '127.0.0.1'
    proxyPort.value = parts[1] || '7890'
    proxyProtocol.value = isSocks5 ? 'socks5' : 'http'
  }
}, { immediate: true })

async function toggleProxy(enabled: boolean) {
  if (enabled) {
    await settingsStore.setProxyConfig(proxyProtocol.value, proxyHost.value, proxyPort.value)
    message.success('代理已启用')
  } else {
    await settingsStore.removeProxy()
    message.success('代理已关闭')
  }
}

async function applyProxy() {
  if (!proxyHost.value || !proxyPort.value) {
    message.warning('请填写完整的代理地址和端口')
    return
  }
  await settingsStore.setProxyConfig(proxyProtocol.value, proxyHost.value, proxyPort.value)
  message.success('代理配置已更新')
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
        <GlobeOutline class="w-4 h-4 dark:text-slate-300 text-zinc-500" />
        <span class="font-semibold text-sm dark:text-white text-zinc-900">网络代理</span>
      </div>
      <NSwitch
        :value="proxyEnabled"
        @update:value="toggleProxy"
        size="medium"
        :loading="settingsStore.proxyLoading"
      >
        <template #checked>
          <span class="text-xs font-medium">ON</span>
        </template>
        <template #unchecked>
          <span class="text-xs font-medium">OFF</span>
        </template>
      </NSwitch>
    </div>

    <!-- 一行流代理配置表单 -->
    <div
      class="flex items-center gap-2 p-3 rounded-lg transition-all duration-300"
      :class="proxyEnabled
        ? 'bg-emerald-500/[0.06] border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.08)]'
        : 'dark:bg-white/[0.03] dark:border-white/[0.06] bg-zinc-50 border border-zinc-200'"
    >
      <!-- 协议选择 -->
      <NSelect
        v-model:value="proxyProtocol"
        size="small"
        :options="[
          { label: 'HTTP', value: 'http' },
          { label: 'SOCKS5', value: 'socks5' },
        ]"
        :disabled="proxyEnabled"
        class="!w-24 proxy-select"
      />

      <!-- 地址输入 -->
      <NInput
        v-model:value="proxyHost"
        size="small"
        placeholder="127.0.0.1"
        :disabled="proxyEnabled"
        class="flex-1"
        @keyup.enter="applyProxy"
      />

      <!-- 端口输入 -->
      <NInput
        v-model:value="proxyPort"
        size="small"
        placeholder="7890"
        :disabled="proxyEnabled"
        class="!w-20"
        @keyup.enter="applyProxy"
      />

      <!-- 应用按钮（仅未启用时显示） -->
      <button
        v-if="!proxyEnabled"
        @click="applyProxy"
        class="flex items-center justify-center w-8 h-8 rounded-lg dark:bg-white/[0.06] bg-zinc-100 dark:hover:bg-white/[0.12] hover:bg-zinc-200 border dark:border-white/[0.08] border-zinc-300 transition-all duration-200 flex-shrink-0"
      >
        <svg class="w-3.5 h-3.5 dark:text-slate-300 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </button>

      <!-- 状态指示（已启用时） -->
      <div
        v-else
        class="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 flex-shrink-0"
      >
        <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span class="text-xs text-emerald-400 font-medium whitespace-nowrap">已连接</span>
      </div>
    </div>
  </NCard>
</template>

<style scoped>
.proxy-select :deep(.n-base-select) {
  --n-border: 1px solid rgba(255, 255, 255, 0.12);
}

/* 亮色模式：下拉框/输入框 —— 纯白底 + zinc-300 边框 + 加深文字/占位符
   锚点 .glass-card 带本组件 scoped hash，只作用于 ProxyCard，不污染其他卡片 */
html:not(.dark) .glass-card :deep(.n-base-selection) {
  --n-color: #ffffff;
  --n-color-disabled: #f4f4f5;
  --n-border: 1px solid #d4d4d8;
  --n-border-hover: 1px solid #a1a1aa;
  --n-border-focus: 1px solid #a1a1aa;
  --n-border-active: 1px solid #a1a1aa;
  --n-text-color: #52525b;
  --n-text-color-disabled: #52525b;
  --n-placeholder-color: #71717a;
}

html:not(.dark) .glass-card :deep(.n-input) {
  --n-color: #ffffff;
  --n-color-disabled: #f4f4f5;
  --n-color-focus: #ffffff;
  --n-border: 1px solid #d4d4d8;
  --n-border-hover: 1px solid #a1a1aa;
  --n-border-focus: 1px solid #a1a1aa;
  --n-text-color: #52525b;
  --n-text-color-disabled: #52525b;
  --n-placeholder-color: #71717a;
}
</style>
