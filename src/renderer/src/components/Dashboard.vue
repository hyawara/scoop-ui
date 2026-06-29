<script setup lang="ts">
import { ref, computed } from 'vue'
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

const recommendedPackages = [
  { name: 'git', icon: 'G', desc: '版本控制', bucket: 'main', color: 'from-orange-500 to-red-500' },
  { name: 'curl', icon: 'C', desc: 'HTTP 请求', bucket: 'main', color: 'from-green-500 to-teal-500' },
  { name: 'neovim', icon: 'N', desc: '终端编辑器', bucket: 'main', color: 'from-green-600 to-emerald-600' },
  { name: 'fzf', icon: 'F', desc: '模糊搜索', bucket: 'main', color: 'from-purple-500 to-pink-500' },
]

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

function handleInstall(pkgName: string) {
  packagesStore.install(pkgName)
  message.info(`正在安装 ${pkgName}...`)
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
  <div class="flex gap-5 h-full">
    <!-- === 左侧大卡片 (7/12) === -->
    <div class="w-7/12 min-w-0 h-full">
      <NCard
        :bordered="false"
        class="!rounded-xl overflow-hidden glass-card h-full"
        content-class="!p-0 flex flex-col h-full"
      >
        <NTabs
          type="line"
          size="large"
          :default-value="'installed'"
          class="flex-1 flex flex-col overflow-hidden"
          :pane-style="{ padding: '0', height: '100%' }"
        >
          <template #prefix>
            <span class="font-semibold text-base text-slate-800 dark:text-gray-200 ml-5">应用管理</span>
          </template>

          <NTabPane name="installed" tab="已安装" class="flex-1 overflow-hidden">
            <div v-if="packagesStore.loading" class="flex justify-center py-16">
              <div class="flex flex-col items-center gap-3">
                <div class="w-6 h-6 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
                <span class="text-xs text-gray-400">加载中...</span>
              </div>
            </div>

            <div v-else-if="packagesStore.installed.length === 0" class="overflow-y-auto h-full pb-4">
              <div class="flex flex-col items-center justify-center pt-12 pb-6 px-8">
                <NEmpty description="暂无已安装的软件包">
                  <template #icon>
                    <NIcon :component="CubeOutline" size="48" class="text-gray-300 dark:text-gray-600" />
                  </template>
                  <template #extra>
                    <p class="text-xs text-gray-400 mt-1">使用顶部搜索框查找并安装软件</p>
                  </template>
                </NEmpty>
              </div>

              <!-- 热门推荐（独立背景板块） -->
              <div class="mx-5 mb-4 bg-slate-50/70 dark:bg-gray-800/40 rounded-xl p-4 border border-slate-100/60 dark:border-gray-700/30">
                <div class="flex items-center gap-2 mb-4">
                  <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">热门推荐</span>
                  <div class="flex-1 h-px bg-slate-200/60 dark:bg-gray-700/40" />
                </div>
                <div class="grid grid-cols-4 gap-3">
                  <div
                    v-for="pkg in recommendedPackages"
                    :key="pkg.name"
                    class="flex flex-col items-center gap-2 p-3 rounded-xl bg-white dark:bg-gray-800/60 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-all duration-200 group border border-slate-100 dark:border-gray-700/40"
                  >
                    <div
                      class="w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm transition-transform group-hover:scale-110"
                      :class="pkg.color"
                    >
                      <span class="text-white text-sm font-bold">{{ pkg.icon }}</span>
                    </div>
                    <span class="text-xs font-medium text-slate-700 dark:text-gray-300">{{ pkg.name }}</span>
                    <span class="text-[10px] text-slate-400 -mt-1">{{ pkg.desc }}</span>
                    <NButton
                      size="tiny"
                      secondary
                      :disabled="installedNames.has(pkg.name)"
                      :loading="packagesStore.loading && packagesStore.progress?.package === pkg.name"
                      @click.stop="handleInstall(pkg.name)"
                      class="!mt-1 btn-hover-scale w-full !rounded-lg"
                    >
                      {{ installedNames.has(pkg.name) ? '已安装' : '安装' }}
                    </NButton>
                  </div>
                </div>
              </div>
            </div>

            <NScrollbar v-else class="h-full">
              <div class="flex flex-col gap-1.5 p-4">
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

          <NTabPane name="updatable" tab="有可更新" class="flex-1 overflow-hidden">
            <NScrollbar class="h-full">
              <div v-if="packagesStore.updatable.length === 0" class="flex flex-col items-center justify-center py-20">
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

          <NTabPane name="discover" tab="软件发现" class="flex-1 overflow-hidden">
            <div class="flex flex-col items-center justify-center pt-12 pb-6 px-8">
              <NEmpty description="在搜索框中探索新软件">
                <template #icon>
                  <NIcon :component="CompassOutline" size="48" class="text-gray-300 dark:text-gray-600" />
                </template>
                <template #extra>
                  <p class="text-xs text-gray-400 mt-1">支持数千款开源软件的一键安装</p>
                </template>
              </NEmpty>
            </div>

            <div class="mx-5 mb-4 bg-slate-50/70 dark:bg-gray-800/40 rounded-xl p-4 border border-slate-100/60 dark:border-gray-700/30">
              <div class="flex items-center gap-2 mb-4">
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">热门发现</span>
                <div class="flex-1 h-px bg-slate-200/60 dark:bg-gray-700/40" />
              </div>
              <div class="grid grid-cols-4 gap-3">
                <div
                  v-for="pkg in recommendedPackages"
                  :key="pkg.name"
                  class="flex flex-col items-center gap-2 p-3 rounded-xl bg-white dark:bg-gray-800/60 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-all duration-200 group border border-slate-100 dark:border-gray-700/40"
                >
                  <div
                    class="w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm transition-transform group-hover:scale-110"
                    :class="pkg.color"
                  >
                    <span class="text-white text-sm font-bold">{{ pkg.icon }}</span>
                  </div>
                  <span class="text-xs font-medium text-slate-700 dark:text-gray-300">{{ pkg.name }}</span>
                  <span class="text-[10px] text-slate-400 -mt-1">{{ pkg.desc }}</span>
                  <NButton
                    size="tiny"
                    secondary
                    :disabled="installedNames.has(pkg.name)"
                    @click.stop="handleInstall(pkg.name)"
                    class="!mt-1 btn-hover-scale w-full !rounded-lg"
                  >
                    {{ installedNames.has(pkg.name) ? '已安装' : '安装' }}
                  </NButton>
                </div>
              </div>
            </div>
          </NTabPane>
        </NTabs>
      </NCard>
    </div>

    <!-- === 右侧列 (5/12) === -->
    <div class="flex-1 flex flex-col gap-4 h-full min-w-0">
      <!-- 缓存管理 -->
      <div class="flex-shrink-0">
        <CacheCard />
      </div>

      <!-- 存储路径 + 网络代理（等高填充） -->
      <div class="flex-1 grid grid-cols-5 gap-4 min-h-0">
        <div class="col-span-3 h-full">
          <StorageCard />
        </div>
        <div class="col-span-2 h-full">
          <ProxyCard />
        </div>
      </div>
    </div>
  </div>
</template>
