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
  <header class="drag-region flex items-center h-12 px-4 gap-4 border-b border-black/5 dark:border-white/10">
    <!-- Left: Logo & Status -->
    <div class="flex items-center gap-3 no-drag">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <span class="text-white text-xs font-bold">S</span>
        </div>
        <span class="font-semibold text-sm">Scoop UI</span>
      </div>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600" />
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1 text-xs">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span class="text-gray-500 dark:text-gray-400">Scoop 正常</span>
        </span>
      </div>
    </div>

    <!-- Center: Search Box -->
    <div class="flex-1 flex justify-center no-drag">
      <div class="search-glow w-full max-w-md relative rounded-lg overflow-hidden transition-all">
        <div class="absolute inset-0 bg-gradient-to-r from-purple-400/20 via-blue-400/20 to-cyan-400/20 opacity-0 focus-within:opacity-100 transition-opacity pointer-events-none" />
        <div class="relative flex items-center bg-black/5 dark:bg-white/10 rounded-lg px-3 py-1.5">
          <NIcon :component="SearchOutline" size="16" class="text-gray-400 mr-2" />
          <input
            ref="searchInputRef"
            :value="searchQuery"
            @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
            placeholder="搜索 Scoop 软件包..."
            class="bg-transparent border-none outline-none text-sm w-full text-gray-700 dark:text-gray-200 placeholder-gray-400"
          />
          <kbd class="text-xs px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 ml-2">
            Ctrl+K
          </kbd>
        </div>
      </div>
    </div>

    <!-- Right: Actions & Window Controls -->
    <div class="flex items-center gap-1 no-drag">
      <NButton text @click="refreshAll" size="small">
        <template #icon>
          <NIcon :component="RefreshOutline" size="16" />
        </template>
      </NButton>
      <NButton text @click="emit('toggleTheme')" size="small">
        <template #icon>
          <NIcon :component="isDark ? SunnyOutline : MoonOutline" size="16" />
        </template>
      </NButton>
      <NButton text size="small">
        <template #icon>
          <NIcon :component="SettingsOutline" size="16" />
        </template>
      </NButton>

      <div class="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />

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
      <NButton text @click="closeWindow" size="small" class="hover:!bg-red-500 hover:!text-white">
        <template #icon>
          <NIcon :component="CloseOutline" size="16" />
        </template>
      </NButton>
    </div>
  </header>
</template>
