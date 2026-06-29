<script setup lang="ts">
import {
  NCard,
  NTabs,
  NTabPane,
  NTag,
  NButton,
  NIcon,
  NProgress,
  NScrollbar,
  useMessage,
} from 'naive-ui'
import {
  DownloadOutline,
  TrashOutline,
  RefreshOutline,
  CloudDownloadOutline,
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import CacheCard from '@/components/CacheCard.vue'
import StorageCard from '@/components/StorageCard.vue'
import ProxyCard from '@/components/ProxyCard.vue'

const packagesStore = usePackagesStore()
const message = useMessage()

function handleInstall(pkg: any) {
  packagesStore.install(pkg.name)
  message.info(`正在安装 ${pkg.name}...`)
}

function handleUpdate(pkg: any) {
  packagesStore.update(pkg.name)
  message.info(`正在更新 ${pkg.name}...`)
}

function handleUninstall(pkg: any) {
  packagesStore.uninstall(pkg.name)
  message.info(`已卸载 ${pkg.name}`)
}
</script>

<template>
  <div class="grid grid-cols-12 gap-4 h-full">
    <!-- Card 1: 应用管理核心 (左侧大卡片) -->
    <NCard
      :bordered="false"
      class="col-span-7 row-span-2 !rounded-xl overflow-hidden"
      content-class="!p-0"
    >
      <NTabs type="line" size="large" :default-value="'installed'" class="h-full flex flex-col">
        <template #prefix>
          <span class="font-semibold text-sm ml-4">应用管理</span>
        </template>

        <NTabPane name="installed" tab="已安装">
          <NScrollbar style="max-height: calc(100vh - 260px)">
            <div v-if="packagesStore.loading" class="flex justify-center py-8">
              <div class="flex flex-col items-center gap-2">
                <div class="w-6 h-6 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
                <span class="text-xs text-gray-400">加载中...</span>
              </div>
            </div>
            <div v-else-if="packagesStore.installed.length === 0" class="flex flex-col items-center justify-center py-12 text-gray-400">
              <CloudDownloadOutline class="w-12 h-12 mb-3 opacity-30" />
              <p class="text-sm">暂无已安装的软件包</p>
              <p class="text-xs mt-1">使用顶部搜索框查找并安装软件</p>
            </div>
            <div v-else class="grid grid-cols-1 gap-2 p-3">
              <div
                v-for="pkg in packagesStore.installed"
                :key="pkg.name"
                class="flex items-center gap-3 p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.04] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors micro-card"
              >
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                  <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm truncate">{{ pkg.name }}</span>
                    <NTag size="small" :bordered="false" type="info">{{ pkg.version || 'unknown' }}</NTag>
                  </div>
                  <p class="text-xs text-gray-400 truncate mt-0.5">{{ pkg.description || '暂无描述' }}</p>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <NButton
                    v-if="pkg.updatable"
                    text
                    size="small"
                    type="warning"
                    @click="handleUpdate(pkg)"
                  >
                    <template #icon><NIcon :component="DownloadOutline" size="14" /></template>
                    更新
                  </NButton>
                  <NButton text size="small" type="error" @click="handleUninstall(pkg)">
                    <template #icon><NIcon :component="TrashOutline" size="14" /></template>
                  </NButton>
                </div>
              </div>
            </div>
          </NScrollbar>
        </NTabPane>

        <NTabPane name="updatable" tab="有可更新">
          <NScrollbar style="max-height: calc(100vh - 260px)">
            <div v-if="packagesStore.updatable.length === 0" class="flex flex-col items-center justify-center py-12 text-gray-400">
              <p class="text-sm">所有软件均为最新版本</p>
            </div>
            <div v-else class="grid grid-cols-1 gap-2 p-3">
              <div
                v-for="pkg in packagesStore.updatable"
                :key="pkg.name"
                class="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors micro-card"
              >
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                  <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm">{{ pkg.name }}</span>
                    <NTag size="small" :bordered="false" type="warning">可更新</NTag>
                  </div>
                </div>
                <NButton size="small" type="warning" @click="handleUpdate(pkg)" :loading="packagesStore.loading">
                  更新
                </NButton>
              </div>
            </div>
          </NScrollbar>
        </NTabPane>

        <NTabPane name="discover" tab="软件发现">
          <div class="flex flex-col items-center justify-center py-12 text-gray-400">
            <p class="text-sm">使用顶部搜索框发现新软件</p>
            <p class="text-xs mt-1">支持数千款开源软件的一键安装</p>
          </div>
        </NTabPane>
      </NTabs>
    </NCard>

    <!-- Card 2: 缓存清理 (右上) -->
    <div class="col-span-5">
      <CacheCard />
    </div>

    <!-- Card 3: 存储路径 (右下左) -->
    <div class="col-span-3">
      <StorageCard />
    </div>

    <!-- Card 4: 代理开关 (右下右) -->
    <div class="col-span-2">
      <ProxyCard />
    </div>
  </div>
</template>

<style scoped>
.micro-card {
  animation: fadeInUp 0.3s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
