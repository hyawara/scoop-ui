<script setup lang="ts">
import { ref } from 'vue'
import {
  NCard,
  NButton,
  NTag,
  NSwitch,
  NSpace,
  NProgress,
  NIcon,
  NPopconfirm,
  useMessage,
} from 'naive-ui'
import {
  DownloadOutline,
  TrashOutline,
  OpenOutline,
  GlobeOutline,
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import type { InstallOptions } from '@/types'

const props = defineProps<{
  pkg: any
  installed: boolean
}>()

const packagesStore = usePackagesStore()
const message = useMessage()

const installOptions = ref<InstallOptions>({
  global: false,
  skipCheck: false,
  independent: false,
})

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
</script>

<template>
  <NCard :bordered="false" class="!rounded-xl h-full" content-class="flex flex-col h-full !p-0">
    <NScrollbar class="flex-1">
      <div class="p-5">
        <!-- Header -->
        <div class="flex items-start gap-4 mb-5">
          <div
            class="w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0"
            :class="installed
              ? 'bg-gradient-to-br from-green-400 to-emerald-500'
              : 'bg-gradient-to-br from-blue-400 to-purple-500'"
          >
            <span class="text-white text-2xl font-bold uppercase">{{ pkg.name[0] }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-1">
              <h2 class="text-xl font-bold truncate">{{ pkg.name }}</h2>
              <NTag v-if="installed" type="success" size="small" :bordered="false">已安装</NTag>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <NTag size="small" :bordered="false">{{ pkg.version || 'unknown' }}</NTag>
              <span v-if="pkg.bucket">/ {{ pkg.bucket }}</span>
            </div>
            <div class="flex items-center gap-2 mt-2">
              <NButton
                v-if="pkg.website"
                text
                size="tiny"
                tag="a"
                :href="pkg.website"
                target="_blank"
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
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
          {{ pkg.description || '暂无描述信息' }}
        </p>

        <!-- Install Progress -->
        <div v-if="packagesStore.loading && packagesStore.progress" class="mb-4">
          <NProgress
            type="line"
            :percentage="packagesStore.progress.percent ?? 50"
            :indicator-placement="'inside'"
            processing
            :height="8"
            :border-radius="4"
          />
          <p class="text-xs text-gray-400 mt-1 truncate">
            {{ packagesStore.progress.message }}
          </p>
        </div>

        <!-- Advanced Options -->
        <div class="bg-black/[0.02] dark:bg-white/[0.04] rounded-lg p-4 mb-4 space-y-3">
          <h4 class="text-sm font-medium mb-3">高级安装选项</h4>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">全局安装 (--global)</span>
            <NSwitch v-model:value="installOptions.global" size="small" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">跳过哈希检查 (--skip)</span>
            <NSwitch v-model:value="installOptions.skipCheck" size="small" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-500">独立安装 (--independent)</span>
            <NSwitch v-model:value="installOptions.independent" size="small" />
          </div>
        </div>

        <!-- Manifest preview (placeholder) -->
        <div class="bg-black/[0.02] dark:bg-white/[0.04] rounded-lg p-4 mb-4">
          <h4 class="text-sm font-medium mb-2">Manifest 信息</h4>
          <pre class="text-xs text-gray-500 font-mono overflow-x-auto whitespace-pre-wrap">{{ JSON.stringify(pkg, null, 2) }}</pre>
        </div>
      </div>
    </NScrollbar>

    <!-- Action Buttons -->
    <div class="p-4 border-t border-black/5 dark:border-white/10 flex gap-3">
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
            <NButton
              type="error"
              size="large"
              class="flex-1"
            >
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
  </NCard>
</template>
