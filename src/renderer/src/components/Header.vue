<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { NButton, NIcon, useMessage } from 'naive-ui'
import { usePackagesStore } from '@/stores/packages'
import { useSettingsStore } from '@/stores/settings'
import {
  SearchOutline,
  SettingsOutline,
  RefreshOutline,
  SunnyOutline,
  MoonOutline,
  RemoveOutline,
  ExpandOutline,
  CloseOutline,
  SquareOutline,
} from '@vicons/ionicons5'

const props = defineProps<{
  searchQuery: string
  isDark: boolean
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  toggleTheme: []
  search: [query: string]
  'openSettings': []
}>()

const searchInputRef = ref<HTMLInputElement | null>(null)
const isMaximized = ref(false)
const message = useMessage()

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))

function minimize() {
  window.scoopAPI.windowControl.minimize()
}

function maximize() {
  window.scoopAPI.windowControl.maximize()
  isMaximized.value = !isMaximized.value
}

function closeWindow() {
  window.scoopAPI.windowControl.close()
}

async function refreshAll() {
  const packagesStore = usePackagesStore()
  const settingsStore = useSettingsStore()
  await Promise.all([
    packagesStore.loadInstalled(),
    packagesStore.loadUpdatable(),
    settingsStore.loadEnv(),
    settingsStore.loadCacheInfo(),
  ])
  message.success('刷新完成')
}
</script>

<template>
  <header class="drag-region flex items-center py-3 px-6 gap-6 border-b border-black/[0.06] dark:border-white/[0.08]">
    <!-- Left: Logo & Status -->
    <div class="flex items-center gap-3 no-drag flex-shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
          <span class="text-white text-xs font-bold">S</span>
        </div>
        <span class="font-semibold text-sm text-gray-700 dark:text-gray-200">Scoop UI</span>
      </div>
      <div class="h-5 w-px bg-gray-200 dark:bg-gray-700" />
      <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-full dark:bg-green-900/40 dark:border-green-700/30 bg-green-100 border border-green-200">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
        <span class="text-xs dark:text-emerald-300 text-emerald-700 font-medium">Scoop 正常</span>
      </div>
    </div>

    <!-- Center: Search Box -->
    <div class="flex-1 flex justify-center no-drag">
      <div class="search-glow w-full max-w-md">
        <div class="search-wrapper flex items-center gap-2 px-4 py-2 dark:bg-white/[0.06] dark:border-white/[0.1] bg-[#EFF2EF] border-transparent rounded-full transition-all duration-300">
          <SearchOutline class="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref="searchInputRef"
            :value="searchQuery"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            @keydown.enter="emit('search', searchQuery)"
            placeholder="搜索 Scoop 软件包..."
            class="bg-transparent border-none outline-none text-sm w-full text-gray-700 dark:text-gray-200 placeholder-gray-400"
          />
          <button
            v-if="searchQuery"
            @click="emit('update:searchQuery', ''); emit('search', '')"
            class="inline-flex items-center justify-center w-7 h-7 rounded-lg dark:hover:bg-white/[0.08] hover:bg-black/[0.04] dark:text-slate-500 dark:hover:text-slate-300 text-gray-500 hover:text-gray-700 transition-all flex-shrink-0"
          >
            <CloseOutline class="w-3.5 h-3.5" />
          </button>
          <button
            @click="emit('search', searchQuery)"
            class="inline-flex items-center justify-center w-7 h-7 rounded-lg dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 dark:text-emerald-400 text-emerald-600 hover:text-emerald-700 transition-all flex-shrink-0"
          >
            <SearchOutline class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Right: Actions & Window Controls -->
    <div class="flex items-center gap-0.5 no-drag flex-shrink-0" style="position: relative; z-index: 10; pointer-events: auto;">
      <NButton text @click="refreshAll" size="small">
        <template #icon>
          <NIcon :component="RefreshOutline" size="16" />
        </template>
      </NButton>
      <NButton text @click="emit('toggleTheme')" size="small">
        <template #icon>
          <NIcon :component="isDark ? MoonOutline : SunnyOutline" size="16" />
        </template>
      </NButton>
      <NButton text size="small" @click="emit('openSettings')">
        <template #icon>
          <NIcon :component="SettingsOutline" size="16" />
        </template>
      </NButton>

      <div class="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1.5" />

      <NButton text @click="minimize" size="small">
        <template #icon>
          <NIcon :component="RemoveOutline" size="16" />
        </template>
      </NButton>
      <NButton text @click="maximize" size="small">
        <template #icon>
          <NIcon :component="isMaximized ? SquareOutline : ExpandOutline" size="14" />
        </template>
      </NButton>
      <NButton text @click="closeWindow" size="small" class="!text-gray-600 dark:!text-gray-300 hover:!bg-red-500 hover:!text-white">
        <template #icon>
          <NIcon :component="CloseOutline" size="16" />
        </template>
      </NButton>
    </div>
  </header>
</template>
