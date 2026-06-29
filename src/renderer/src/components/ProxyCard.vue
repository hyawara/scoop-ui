<script setup lang="ts">
import { ref } from 'vue'
import { NCard, NSwitch, NInput, NSelect, NButton, useMessage } from 'naive-ui'
import {
  GlobeOutline,
  FlashOutline,
  DesktopOutline,
  CloseCircleOutline,
} from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const message = useMessage()

const proxyEnabled = ref(false)
const proxyAddress = ref('')
const proxyType = ref<'http' | 'socks5'>('http')

async function handleToggle(val: boolean) {
  proxyEnabled.value = val
  if (val && proxyAddress.value) {
    const addr = proxyType.value === 'socks5'
      ? `socks5://${proxyAddress.value}`
      : proxyAddress.value
    await settingsStore.setProxy(addr)
    message.success('代理已启用')
  } else if (!val) {
    await settingsStore.removeProxy()
    message.info('代理已关闭')
  }
}

async function applyPreset(address: string, type: 'http' | 'socks5') {
  proxyType.value = type
  proxyAddress.value = address
  if (!proxyEnabled.value) {
    proxyEnabled.value = true
  }
  const addr = type === 'socks5' ? `socks5://${address}` : address
  await settingsStore.setProxy(addr)
  message.success(`代理已切换至 ${address}`)
}

async function clearAll() {
  proxyAddress.value = ''
  proxyEnabled.value = false
  await settingsStore.removeProxy()
  message.info('代理已清除')
}
</script>

<template>
  <NCard :bordered="false" class="!rounded-xl glass-card h-full" content-class="h-full flex flex-col p-0">
    <div class="flex items-center justify-between mb-3 pt-4 px-4">
      <span class="font-semibold text-sm text-gray-700 dark:text-gray-200">网络代理</span>
      <GlobeOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="flex flex-col gap-3 flex-1 px-4 pb-4">
      <!-- Status switch -->
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500">代理状态</span>
        <NSwitch
          v-model:value="proxyEnabled"
          @update:value="handleToggle"
          size="small"
        />
      </div>

      <!-- Type dropdown -->
      <NSelect
        v-model:value="proxyType"
        size="small"
        :options="[
          { label: 'HTTP', value: 'http' },
          { label: 'SOCKS5', value: 'socks5' },
        ]"
      />

      <!-- Address input -->
      <NInput
        v-model:value="proxyAddress"
        size="small"
        placeholder="127.0.0.1:7890"
        :disabled="!proxyEnabled"
      />

      <!-- Quick preset buttons -->
      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] text-gray-400 font-medium uppercase tracking-wider">快捷设置</span>
        <div class="grid grid-cols-2 gap-1.5">
          <NButton
            size="tiny"
            secondary
            @click="applyPreset('127.0.0.1:7890', 'http')"
            class="btn-hover-scale !justify-start"
          >
            <template #icon>
              <FlashOutline class="w-3 h-3" />
            </template>
            <span class="text-[10px]">本地 7890</span>
          </NButton>
          <NButton
            size="tiny"
            secondary
            @click="applyPreset('127.0.0.1:1080', 'socks5')"
            class="btn-hover-scale !justify-start"
          >
            <template #icon>
              <DesktopOutline class="w-3 h-3" />
            </template>
            <span class="text-[10px]">SOCKS5 1080</span>
          </NButton>
        </div>
        <NButton
          size="tiny"
          dashed
          @click="clearAll"
          block
          class="btn-hover-scale"
          :disabled="!proxyEnabled && !proxyAddress"
        >
          <template #icon>
            <CloseCircleOutline class="w-3 h-3" />
          </template>
          <span class="text-[10px]">清除代理</span>
        </NButton>
      </div>
    </div>
  </NCard>
</template>
