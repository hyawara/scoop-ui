<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, provide, nextTick } from 'vue'
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NLoadingBarProvider,
  darkTheme,
  lightTheme,
  zhCN,
  dateZhCN,
} from 'naive-ui'
import { useAppStore } from '@/stores/app'
import { usePackagesStore } from '@/stores/packages'
import { useSettingsStore } from '@/stores/settings'
import Header from '@/components/Header.vue'
import Dashboard from '@/components/Dashboard.vue'
import SearchPanel from '@/components/SearchPanel.vue'
import Onboarding from '@/components/Onboarding.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { usePackageProgress } from '@/composables/usePackageProgress'

const appStore = useAppStore()
const packagesStore = usePackagesStore()
const settingsStore = useSettingsStore()
const pkgProgress = usePackageProgress()

const isDark = ref(true)
const fontFamily = ref('')
const searchQuery = ref('')
const committedSearch = ref('')
const showSettings = ref(false)

// Shared update check state for UpdateManager + SettingsPanel
const updateInfo = ref<{
  hasUpdate: boolean
  version: string
  notes: string
  pubDate: string
  downloadUrl: string
  checking: boolean
}>({
  hasUpdate: false,
  version: '',
  notes: '',
  pubDate: '',
  downloadUrl: '',
  checking: false,
})

const UPDATE_CHECK_URL = 'https://github.com/hyawara/scoop-ui/releases/latest/download/update.json'

async function checkForUpdate() {
  if (updateInfo.value.checking) return
  updateInfo.value.checking = true
  try {
    const result = await window.scoopAPI.checkForUpdate(UPDATE_CHECK_URL)
    if (result.hasUpdate) {
      updateInfo.value = {
        hasUpdate: true,
        version: result.version || '',
        notes: result.notes || '',
        pubDate: result.pubDate || '',
        downloadUrl: result.downloadUrl || '',
        checking: false,
      }
    } else {
      updateInfo.value = { ...updateInfo.value, hasUpdate: false, checking: false }
    }
  } catch {
    updateInfo.value = { ...updateInfo.value, hasUpdate: false, checking: false }
  }
}

function handleSearch(query: string) {
  if (query.trim()) {
    committedSearch.value = query.trim()
  } else {
    committedSearch.value = ''
  }
}

watch(searchQuery, (val) => {
  if (!val.trim()) {
    committedSearch.value = ''
    packagesStore.searchResults = []
  }
})

const themeOverrides = computed(() => {
  const base = {
    borderRadius: '8px',
    primaryColor: '#7B6FF0',
    primaryColorHover: '#9F94F5',
    bodyColor: 'transparent',
    cardColor: '#13151a',
    modalColor: '#1e222b',
    actionColor: '#1e222b',
    scrollbarColor: 'rgba(255,255,255,0.12)',
    scrollbarColorHover: 'rgba(255,255,255,0.2)',
    dividerColor: 'rgba(255,255,255,0.08)',
    inputColor: 'rgba(255,255,255,0.06)',
    inputColorFocus: 'rgba(255,255,255,0.1)',
    inputBorder: 'rgba(255,255,255,0.12)',
    inputBorderFocus: '#7B6FF0',
    popoverColor: '#1e222b',
    tableColor: 'transparent',
    tagColor: 'rgba(255,255,255,0.08)',
    buttonColor2: '#1e222b',
    buttonColor2Hover: '#262b36',
    closeColor: 'rgba(255,255,255,0.5)',
    closeColorHover: 'rgba(255,255,255,0.8)',
  } as Record<string, any>
  if (fontFamily.value) base.fontFamily = fontFamily.value
  return { common: base }
})

provide('searchQuery', searchQuery)
provide('updateInfo', updateInfo)
provide('checkForUpdate', checkForUpdate)

onMounted(async () => {
  // 从 config.json 加载主题配置
  try {
    const theme = await window.scoopAPI.getConfig('theme')
    if (theme) {
      if (typeof theme.dark === 'boolean') isDark.value = theme.dark
      if (typeof theme.fontFamily === 'string') fontFamily.value = theme.fontFamily
    }
  } catch { /* use defaults */ }

  // 全局持久化日志监听器：始终路由到共享 progressMap，跨 tab 不丢失
  window.scoopAPI.onLog((data) => {
    if (data?.package && data?.message) {
      pkgProgress.handleLog(data.package, data.message)
    }
  })

  await appStore.checkScoop()
  if (appStore.scoopStatus.installed) {
    await Promise.all([
      packagesStore.loadInstalled(),
      packagesStore.loadUpdatable(),
      settingsStore.loadEnv(),
      settingsStore.loadCacheInfo(),
      settingsStore.checkAria2(),
      settingsStore.loadProxy(),
    ])

    // Silently check for app updates
    checkForUpdate()
  }
})

// 字体配置变化时同步到全局 body + Naive UI
watch(fontFamily, (val) => {
  nextTick(() => {
    document.body.style.fontFamily = val || null
  })
}, { immediate: true })

function toggleTheme() {
  isDark.value = !isDark.value
  window.scoopAPI.setConfig('theme.dark', isDark.value)
}

function openSettings() {
  showSettings.value = true
}
</script>

<template>
  <NConfigProvider
    :theme="isDark ? darkTheme : lightTheme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <NMessageProvider>
      <NDialogProvider>
        <NLoadingBarProvider>
          <div class="flex flex-col h-full w-full">
            <!-- Onboarding page when Scoop not installed -->
            <Onboarding v-if="!appStore.scoopStatus.installed && !appStore.scoopStatus.checking" />

            <!-- Main app -->
            <template v-else-if="appStore.scoopStatus.installed">
              <Header
                v-model:search-query="searchQuery"
                :is-dark="isDark"
                @toggle-theme="toggleTheme"
                @search="handleSearch"
                @open-settings="openSettings"
              />

              <div class="h-[calc(100vh-70px)] overflow-hidden mx-auto max-w-[1280px] w-full px-6 py-4 relative">
                <Transition name="fade" mode="out-in">
                  <Dashboard v-if="!committedSearch.trim()" />
                  <SearchPanel v-else :query="committedSearch" />
                </Transition>
              </div>
            </template>

            <!-- Loading -->
            <div v-else class="flex-1 flex items-center justify-center">
              <div class="flex flex-col items-center gap-3">
                <div class="w-8 h-8 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
                <span class="text-sm text-gray-400">正在检测 Scoop 环境...</span>
              </div>
            </div>
          </div>
        </NLoadingBarProvider>
      </NDialogProvider>
    </NMessageProvider>

    <!-- Settings Panel (inside providers for NModal context) -->
    <SettingsPanel v-model:show="showSettings" />
  </NConfigProvider>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
