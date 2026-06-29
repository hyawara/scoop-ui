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

async function toggleProxy(val: boolean) {
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
  <NCard :bordered="false" class="!rounded-xl h-full" content-class="h-full">
    <div class="flex items-center justify-between mb-2">
      <span class="font-semibold text-sm">网络代理</span>
      <GlobeOutline class="w-4 h-4 text-gray-400" />
    </div>

    <div class="flex flex-col gap-3 mt-2">
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500">代理状态</span>
        <NSwitch
          v-model:value="proxyEnabled"
          @update:value="toggleProxy"
          size="small"
        />
      </div>

      <div>
        <NSelect
          v-model:value="proxyType"
          size="small"
          :options="[
            { label: 'HTTP', value: 'http' },
            { label: 'SOCKS5', value: 'socks5' },
          ]"
          class="mb-2"
        />
        <NInput
          v-model:value="proxyAddress"
          size="small"
          placeholder="127.0.0.1:7890"
          :disabled="!proxyEnabled"
        />
      </div>

      <NButton
        size="small"
        type="primary"
        :disabled="!proxyAddress"
        :loading="settingsStore.loading"
        @click="toggleProxy(!proxyEnabled); proxyEnabled = !proxyEnabled"
        block
      >
        {{ proxyEnabled ? '关闭代理' : '启用代理' }}
      </NButton>
    </div>
  </NCard>
</template>
