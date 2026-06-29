<script setup lang="ts">
import { ref } from 'vue'
import { NCard, NSwitch, NInput, NSelect, NButton, useMessage } from 'naive-ui'
import { GlobeOutline } from '@vicons/ionicons5'
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
</script>

<template>
  <NCard :bordered="false" class="!rounded-xl h-full glass-card" content-class="h-full flex flex-col">
    <div class="flex items-center justify-between mb-3">
      <span class="font-semibold text-sm text-gray-700 dark:text-gray-200">网络代理</span>
      <GlobeOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="flex flex-col space-y-4 flex-1">
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
        size="medium"
        :options="[
          { label: 'HTTP', value: 'http' },
          { label: 'SOCKS5', value: 'socks5' },
        ]"
      />

      <!-- Address input -->
      <NInput
        v-model:value="proxyAddress"
        size="medium"
        placeholder="127.0.0.1:7890"
        :disabled="!proxyEnabled"
      />

      <!-- Action button -->
      <div class="flex-1 flex items-end">
        <NButton
          size="medium"
          secondary
          :disabled="!proxyAddress"
          :loading="settingsStore.loading"
          @click="handleToggle(!proxyEnabled)"
          block
          class="btn-hover-scale"
        >
          {{ proxyEnabled ? '关闭代理' : '启用代理' }}
        </NButton>
      </div>
    </div>
  </NCard>
</template>
