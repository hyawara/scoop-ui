<script setup lang="ts">
import { ref, watch, onMounted, provide } from 'vue'
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

const appStore = useAppStore()
const packagesStore = usePackagesStore()
const settingsStore = useSettingsStore()

const isDark = ref(true)
const searchQuery = ref('')
const committedSearch = ref('')

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

const themeOverrides = {
  common: {
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
  },
}

provide('searchQuery', searchQuery)

onMounted(async () => {
  await appStore.checkScoop()
  if (appStore.scoopStatus.installed) {
    await Promise.all([
      packagesStore.loadInstalled(),
      packagesStore.loadUpdatable(),
      settingsStore.loadEnv(),
      settingsStore.loadCacheInfo(),
    ])
  }
})

function toggleTheme() {
  isDark.value = !isDark.value
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
