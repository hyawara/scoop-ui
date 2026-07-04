<script setup lang="ts">
import { ref, computed, watch, onMounted, provide, nextTick } from 'vue'
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
const fontList = ref<string[]>([])
const colorPreset = ref('aurora')
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
  error: string
}>({
  hasUpdate: false,
  version: '',
  notes: '',
  pubDate: '',
  downloadUrl: '',
  checking: false,
  error: '',
})

const appDownloading = ref(false)

const UPDATE_CHECK_URL = 'https://github.com/hyawara/scoop-ui/releases/latest/download/update.json'

async function checkForUpdate() {
  if (updateInfo.value.checking) return
  updateInfo.value.checking = true
  try {
    const result = await window.scoopAPI.checkForUpdate(UPDATE_CHECK_URL)
    if (result.error) {
      updateInfo.value = { ...updateInfo.value, hasUpdate: false, checking: false, error: result.error }
    } else if (result.hasUpdate) {
      updateInfo.value = {
        hasUpdate: true,
        version: result.version || '',
        notes: result.notes || '',
        pubDate: result.pubDate || '',
        downloadUrl: result.downloadUrl || '',
        checking: false,
        error: '',
      }
    } else {
      updateInfo.value = { ...updateInfo.value, hasUpdate: false, checking: false, error: '' }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    updateInfo.value = { ...updateInfo.value, hasUpdate: false, checking: false, error: msg }
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

const presetColors: Record<string, { primary: string; primaryHover: string }> = {
  aurora: { primary: '#7B6FF0', primaryHover: '#9F94F5' },
  ocean: { primary: '#3B82F6', primaryHover: '#60A5FA' },
  emerald: { primary: '#10B981', primaryHover: '#34D399' },
  sunset: { primary: '#F59E0B', primaryHover: '#FBBF24' },
  rose: { primary: '#EC4899', primaryHover: '#F472B6' },
}

// ─── 🍵 护眼豆沙绿 (Matcha Light) 主题覆盖 ───
const lightMatchaOverrides = computed(() => {
  // 亮色模式下强制统一使用抹茶绿为主色调，不随 colorPreset 改变
  const MATCHA_GREEN = '#4E8A64'
  const MATCHA_GREEN_HOVER = '#5D9E74'
  const base: Record<string, any> = {
    borderRadius: '8px',
    primaryColor: MATCHA_GREEN,
    primaryColorHover: MATCHA_GREEN_HOVER,
    bodyColor: 'transparent',
    cardColor: '#FFFFFF',
    modalColor: '#FFFFFF',
    actionColor: '#F4F7F4',
    scrollbarColor: 'rgba(0,0,0,0.12)',
    scrollbarColorHover: 'rgba(0,0,0,0.2)',
    // ── 全面去除边框线 ──
    dividerColor: 'transparent',
    borderColor: 'transparent',
    // ── 输入框（浅绿色背景，确保光标清晰可见） ──
    inputColor: '#EAEFEA',
    inputColorFocus: '#EAEFEA',
    inputBorder: 'transparent',
    inputBorderFocus: MATCHA_GREEN,
    // ── 弹出层 ──
    popoverColor: '#FFFFFF',
    // ── 表格 ──
    tableColor: 'transparent',
    tableHeaderColor: '#F4F7F4',
    tableRowColorHover: 'rgba(0,0,0,0.02)',
    // ── 标签 ──
    tagColor: 'rgba(0,0,0,0.04)',
    // ── 按钮 ──
    buttonColor2: '#FFFFFF',
    buttonColor2Hover: '#F0F2F0',
    // ── 关闭按钮 ──
    closeColor: 'rgba(0,0,0,0.4)',
    closeColorHover: 'rgba(0,0,0,0.7)',
    // ── 文字（高对比度，确保清晰） ──
    textColor1: '#1E2D22',
    textColor2: '#55665A',
    textColor3: '#8A9D8E',
    placeholderColor: '#9EAD9E',
    // ── 输入框内部文字 ──
    inputTextColor: '#1E2D22',
    inputTextColorFocus: '#1E2D22',
    inputPlaceholderColor: '#9EAD9E',
    // ── 状态色 ──
    loadingColor: MATCHA_GREEN,
    successColor: MATCHA_GREEN,
    warningColor: '#E6A23C',
    errorColor: '#E87461',
    // ── 进度条 ──
    railColor: 'rgba(0,0,0,0.04)',
    fillColor: MATCHA_GREEN,
    // ── 悬停效果 ──
    hoverColor: 'rgba(0,0,0,0.03)',
  }
  if (fontFamily.value) base.fontFamily = fontFamily.value

  // ── 组件级覆盖 ──
  const components: Record<string, any> = {
    Card: { borderColor: 'transparent', titleTextColor: '#1E2D22' },
    DataTable: {
      borderColor: 'transparent',
      tdColor: '#FFFFFF',
      thColor: '#F4F7F4',
      thTextColor: '#55665A',
    },
    Input: {
      border: 'rgba(0,0,0,0.06)',
      borderHover: MATCHA_GREEN,
      borderFocus: MATCHA_GREEN,
    },
    Select: {
      border: 'rgba(0,0,0,0.06)',
      borderHover: MATCHA_GREEN,
      borderFocus: MATCHA_GREEN,
    },
    Tag: { border: 'transparent' },
    Dialog: { border: 'transparent' },
    Modal: { border: 'transparent' },
    Button: {
      // 次要按钮：白底无边框，灰色悬浮
      color2: '#FFFFFF',
      color2Hover: '#F0F2F0',
      border: 'transparent',
      borderHover: 'transparent',
      borderFocus: 'transparent',
      textColor2: '#55665A',
      textColor2Hover: '#1E2D22',
    },
    Checkbox: {
      checkMarkColor: '#FFFFFF',
      border: 'rgba(0,0,0,0.15)',
      borderFocus: MATCHA_GREEN,
      colorChecked: MATCHA_GREEN,
    },
    Switch: {
      railColor: 'rgba(0,0,0,0.12)',
      railColorActive: MATCHA_GREEN,
    },
    Progress: {
      railColor: 'rgba(0,0,0,0.04)',
      fillColor: MATCHA_GREEN,
    },
  }

  return { common: base, ...components }
})

// ─── 🌑 极客暗色模式 主题覆盖 ───
const darkDefaultOverrides = computed(() => {
  const colors = presetColors[colorPreset.value] || presetColors.aurora
  const base: Record<string, any> = {
    borderRadius: '8px',
    primaryColor: colors.primary,
    primaryColorHover: colors.primaryHover,
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
    inputBorderFocus: colors.primary,
    popoverColor: '#1e222b',
    tableColor: 'transparent',
    tagColor: 'rgba(255,255,255,0.08)',
    buttonColor2: '#1e222b',
    buttonColor2Hover: '#262b36',
    closeColor: 'rgba(255,255,255,0.5)',
    closeColorHover: 'rgba(255,255,255,0.8)',
    textColor1: '#e2e8f0',
    textColor2: '#94a3b8',
    textColor3: '#64748b',
    placeholderColor: '#475569',
    borderColor: 'rgba(255,255,255,0.08)',
    hoverColor: 'rgba(255,255,255,0.03)',
    tableHeaderColor: 'rgba(255,255,255,0.04)',
    tableRowColorHover: 'rgba(255,255,255,0.02)',
    loadingColor: colors.primary,
    successColor: '#10B981',
    warningColor: '#F59E0B',
    errorColor: '#EF4444',
    inputTextColor: '#e2e8f0',
    inputTextColorFocus: '#e2e8f0',
    inputPlaceholderColor: '#475569',
    railColor: 'rgba(255,255,255,0.08)',
    fillColor: colors.primary,
  }
  if (fontFamily.value) base.fontFamily = fontFamily.value
  return { common: base }
})

const themeOverrides = computed(() => {
  return isDark.value ? darkDefaultOverrides.value : lightMatchaOverrides.value
})

provide('searchQuery', searchQuery)
provide('updateInfo', updateInfo)
provide('checkForUpdate', checkForUpdate)
provide('isDark', isDark)
provide('fontFamily', fontFamily)
provide('fontList', fontList)
provide('colorPreset', colorPreset)
provide('showSettings', showSettings)
provide('appDownloading', appDownloading)

function parseFontFamilyToArray(cssStr: string): string[] {
  if (!cssStr) return []
  const result: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''
  for (const ch of cssStr) {
    if ((ch === "'" || ch === '"') && !inQuote) {
      inQuote = true
      quoteChar = ch
    } else if (ch === quoteChar && inQuote) {
      inQuote = false
    } else if (ch === ',' && !inQuote) {
      const trimmed = current.trim()
      if (trimmed) result.push(trimmed)
      current = ''
    } else {
      current += ch
    }
  }
  const trimmed = current.trim()
  if (trimmed) result.push(trimmed)
  const generics = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded'])
  return result.filter(f => !generics.has(f.toLowerCase()))
}

function fontListToCssString(list: string[]): string {
  if (!list || list.length === 0) {
    return "'Segoe UI','Microsoft YaHei',sans-serif"
  }
  const quoted = list.map(f => `'${f}'`)
  return [...quoted, 'sans-serif'].join(',')
}

function syncHtmlDarkClass(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

onMounted(async () => {
  // 从 config.json 加载主题配置 (冷启动回显)
  try {
    const theme = await window.scoopAPI.getConfig('theme')
    if (theme) {
      if (typeof theme.dark === 'boolean') isDark.value = theme.dark
      if (typeof theme.fontFamily === 'string') {
        fontFamily.value = theme.fontFamily
        fontList.value = parseFontFamilyToArray(theme.fontFamily)
      }
      if (typeof theme.colorPreset === 'string') colorPreset.value = theme.colorPreset
    }
  } catch { /* use defaults */ }

  // 同步 .dark 类到 <html> (Tailwind dark: variant 的开关)
  syncHtmlDarkClass(isDark.value)

  // Watch isDark 变化：同步 HTML class + 持久化到 config.json
  watch(isDark, (val) => {
    syncHtmlDarkClass(val)
    window.scoopAPI.setConfig('theme.dark', val)
  })

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

// 字体列表变化时同步到 fontFamily CSS 字符串并持久化
watch(fontList, (newList) => {
  const cssStr = fontListToCssString(newList)
  fontFamily.value = cssStr
  window.scoopAPI.setConfig('theme.fontFamily', cssStr)
}, { deep: true })

// 字体配置变化时同步到全局 body + CSS 自定义属性 + Naive UI
watch(fontFamily, (val) => {
  nextTick(() => {
    document.body.style.fontFamily = val || ''
    if (val) document.documentElement.style.setProperty('--font-mono', val)
  })
}, { immediate: true })

function toggleTheme() {
  isDark.value = !isDark.value
  // syncHtmlDarkClass + persistence handled by watch(isDark)
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

        <SettingsPanel v-model:show="showSettings" />
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
