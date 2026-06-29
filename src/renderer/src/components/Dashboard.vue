<script setup lang="ts">
import {
  NCard,
  NTabs,
  NTabPane,
  NTag,
  NButton,
  NIcon,
  NEmpty,
  NScrollbar,
  useMessage,
} from 'naive-ui'
import {
  DownloadOutline,
  TrashOutline,
  CloudDownloadOutline,
  CubeOutline,
  CheckmarkDoneOutline,
  CompassOutline,
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
    <NCard :bordered="false" class="col-span-7 row-span-2 !rounded-xl overflow-hidden glass-card" content-class="!p-0">
      <NTabs
        type="line"
        size="large"
        :default-value="'installed'"
        class="h-full flex flex-col"
        :pane-style="{ padding: '0' }"
      >
        <template #prefix>
          <span class="font-semibold text-sm ml-5 text-gray-700 dark:text-gray-200">应用管理</span>
        </template>

        <NTabPane name="installed" tab="已安装">
          <NScrollbar style="max-height: calc(100vh - 260px)">
            <div v-if="packagesStore.loading" class="flex justify-center py-16">
              <div class="flex flex-col items-center gap-3">
                <div class="w-6 h-6 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
                <span class="text-xs text-gray-400">加载中...</span>
              </div>
            </div>

            <div v-else-if="packagesStore.installed.length === 0" class="flex items-center justify-center py-20">
              <NEmpty description="暂无已安装的软件包">
                <template #icon>
                  <NIcon :component="CubeOutline" size="48" class="text-gray-300 dark:text-gray-600" />
                </template>
                <template #extra>
                  <p class="text-xs text-gray-400 mt-1">使用顶部搜索框查找并安装软件</p>
                </template>
              </NEmpty>
            </div>

            <div v-else class="flex flex-col gap-1.5 p-4">
              <div
                v-for="pkg in packagesStore.installed"
                :key="pkg.name"
                class="flex items-center gap-3 p-3 rounded-xl bg-gray-50/80 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors micro-card"
              >
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm truncate text-gray-700 dark:text-gray-200">{{ pkg.name }}</span>
                    <NTag size="small" :bordered="false" type="info">{{ pkg.version || 'unknown' }}</NTag>
                  </div>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <NButton v-if="pkg.updatable" text size="small" type="warning" @click="handleUpdate(pkg)">
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
            <div v-if="packagesStore.updatable.length === 0" class="flex items-center justify-center py-20">
              <NEmpty description="所有软件均为最新版本">
                <template #icon>
                  <NIcon :component="CheckmarkDoneOutline" size="48" class="text-gray-300 dark:text-gray-600" />
                </template>
              </NEmpty>
            </div>
            <div v-else class="flex flex-col gap-1.5 p-4">
              <div
                v-for="pkg in packagesStore.updatable"
                :key="pkg.name"
                class="flex items-center gap-3 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors micro-card"
              >
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span class="text-white text-xs font-bold uppercase">{{ pkg.name[0] }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm text-gray-700 dark:text-gray-200">{{ pkg.name }}</span>
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
          <div class="flex items-center justify-center py-20">
            <NEmpty description="在搜索框中探索新软件">
              <template #icon>
                <NIcon :component="CompassOutline" size="48" class="text-gray-300 dark:text-gray-600" />
              </template>
              <template #extra>
                <p class="text-xs text-gray-400 mt-1">支持数千款开源软件的一键安装</p>
              </template>
            </NEmpty>
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
