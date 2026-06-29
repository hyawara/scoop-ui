<script setup lang="ts">
import { ref } from 'vue'
import { NCard, NSelect, NInput, NButton, NIcon, useMessage } from 'naive-ui'
import { GlobeOutline, FlashOutline, RocketOutline, CloseOutline } from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const settingsStore = useSettingsStore()
const message = useMessage()

const proxyAddress = ref('')
const proxyType = ref<'http' | 'socks5'>('http')

const quickPresets = [
  { label: '⚡ 7890', address: '127.0.0.1:7890', type: 'http' as const },
  { label: '🔒 SOCKS5', address: '127.0.0.1:1080', type: 'socks5' as const },
  { label: '❌ 清除', address: '', type: 'http' as const },
]

async function applyPreset(preset: typeof quickPresets[0]) {
  if (preset.address) {
    await settingsStore.setProxy(preset.address)
    proxyAddress.value = preset.address
    proxyType.value = preset.type
    message.success(`已切换代理: ${preset.label}`)
  } else {
    await settingsStore.removeProxy()
    proxyAddress.value = ''
    message.success('已清除代理')
  }
}
</script>

<template>
  <NCard :bordered="false" class="!rounded-xl glass-card" content-class="flex flex-col gap-2.5 p-3">
    <div class="flex items-center justify-between">
      <span class="font-semibold text-sm text-slate-800 dark:text-gray-200">网络代理</span>
      <GlobeOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="grid grid-cols-3 gap-1.5">
      <NButton
        v-for="preset in quickPresets"
        :key="preset.label"
        size="tiny"
        secondary
        @click="applyPreset(preset)"
        class="btn-hover-scale !rounded-lg"
      >
        {{ preset.label }}
      </NButton>
    </div>

    <div class="flex gap-2">
      <NSelect
        v-model:value="proxyType"
        size="tiny"
        :options="[
          { label: 'HTTP', value: 'http' },
          { label: 'SOCKS5', value: 'socks5' },
        ]"
        style="width: 80px"
      />
      <NInput
        v-model:value="proxyAddress"
        size="tiny"
        placeholder="127.0.0.1:7890"
        class="flex-1"
      />
    </div>
  </NCard>
</template>
