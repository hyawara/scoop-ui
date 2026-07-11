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
import UpdateManager from '@/components/UpdateManager.vue'
import TerminalDrawer from '@/components/TerminalDrawer.vue'
import { usePackageProgress } from '@/composables/usePackageProgress'
import { resolvePreset, DEFAULT_PRESET } from '@/theme/presets'

const appStore = useAppStore()
const packagesStore = usePackagesStore()
const settingsStore = useSettingsStore()
const pkgProgress = usePackageProgress()

const isDark = ref(true)
const fontFamily = ref('')
const fontList = ref<string[]>([])
const fontSize = ref(14)
const colorPreset = ref(DEFAULT_PRESET)
const searchQuery = ref('')
const committedSearch = ref('')
const showSettings = ref(false)
const showTerminalDrawer = ref(false)
const autoCheckUpdate = ref(true)

// Shared update state for UpdateManager + SettingsPanel.
// 由 electron-updater 事件流（app:updateEvent）驱动，不再手动轮询 URL。
type UpdatePhase = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
const updateInfo = ref<{
  phase: UpdatePhase
  hasUpdate: boolean
  version: string
  notes: string
  releaseDate: string
  checking: boolean
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
  size: number
  error: string
}>({
  phase: 'idle',
  hasUpdate: false,
  version: '',
  notes: '',
  releaseDate: '',
  checking: false,
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  size: 0,
  error: '',
})

// 手动检查更新时抑制右下角全局 toast：把反馈战场交回设置窗口
const suppressUpdateToast = ref(false)

// downloading 或 downloaded 时视为"更新占用中"，供 UpdateManager banner 常驻判断
const appDownloading = computed(() =>
  updateInfo.value.phase === 'downloading' || updateInfo.value.phase === 'downloaded'
)

// 静默检查更新：结果由 app:updateEvent 事件流回填，这里只负责触发 + 兜底错误
// manual=true 表示用户在设置页主动点击，此时抑制右下角全局 toast，反馈就地闭环在设置窗口
async function checkForUpdate(manual = false) {
  if (updateInfo.value.checking) return
  suppressUpdateToast.value = manual
  updateInfo.value.checking = true
  updateInfo.value.error = ''
  try {
    const result = await window.scoopAPI.checkForUpdate()
    if (result.devMode) {
      // 开发模式无 latest.yml，通过 not-available 反馈给 UI
      updateInfo.value.phase = 'not-available'
      updateInfo.value.version = result.version || ''
      updateInfo.value.checking = false
      return
    }
    if (result.error) {
      updateInfo.value.error = result.error
    }
  } catch (e) {
    updateInfo.value.error = e instanceof Error ? e.message : String(e)
  } finally {
    updateInfo.value.checking = false
  }
}

// 触发差分下载（由用户点击"立即更新"驱动）
async function startDownloadUpdate() {
  const result = await window.scoopAPI.downloadUpdate()
  if (!result.success && result.error) {
    updateInfo.value.error = result.error
  }
}

function quitAndInstallUpdate() {
  window.scoopAPI.quitAndInstall()
}

// 事件流状态机：统一消费主进程推送的 app:updateEvent
function handleUpdateEvent(evt: UpdateEvent) {
  switch (evt.status) {
    case 'checking':
      updateInfo.value.phase = 'checking'
      updateInfo.value.checking = true
      break
    case 'available':
      updateInfo.value.phase = 'available'
      updateInfo.value.hasUpdate = true
      updateInfo.value.version = evt.version
      updateInfo.value.notes = evt.notes
      updateInfo.value.releaseDate = evt.releaseDate
      updateInfo.value.size = evt.size
      updateInfo.value.checking = false
      break
    case 'not-available':
      updateInfo.value.phase = 'not-available'
      updateInfo.value.hasUpdate = false
      updateInfo.value.version = evt.version
      updateInfo.value.checking = false
      break
    case 'progress':
      updateInfo.value.phase = 'downloading'
      updateInfo.value.percent = evt.percent
      updateInfo.value.bytesPerSecond = evt.bytesPerSecond
      updateInfo.value.transferred = evt.transferred
      updateInfo.value.total = evt.total
      break
    case 'downloaded':
      updateInfo.value.phase = 'downloaded'
      updateInfo.value.percent = 100
      updateInfo.value.version = evt.version
      updateInfo.value.notes = evt.notes
      updateInfo.value.releaseDate = evt.releaseDate
      updateInfo.value.size = evt.size
      break
    case 'error':
      updateInfo.value.phase = 'error'
      updateInfo.value.checking = false
      updateInfo.value.error = evt.message
      break
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

// ─── 当前激活的主题预设（唯一数据源 theme/presets.ts）───
const activePreset = computed(() => resolvePreset(colorPreset.value))

// ─── 🎨 亮色模式主题覆盖（主色跟随 colorPreset 动态切换，Brand-600 档保证白底高对比）───
const lightMatchaOverrides = computed(() => {
  // 亮色模式取 light 档（600 系，白底对比度更高，符合 WCAG）
  const c = activePreset.value.light
  const MATCHA_GREEN = c.primary
  const MATCHA_GREEN_HOVER = c.primaryHover
  const MATCHA_GREEN_PRESSED = c.primaryPressed
  const base: Record<string, any> = {
    borderRadius: '8px',
    primaryColor: MATCHA_GREEN,
    primaryColorHover: MATCHA_GREEN_HOVER,
    primaryColorPressed: MATCHA_GREEN_PRESSED,
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
  // 暗色模式取 dark 档（500 系，深底上更鲜亮跳脱）
  const colors = activePreset.value.dark
  const base: Record<string, any> = {
    borderRadius: '8px',
    primaryColor: colors.primary,
    primaryColorHover: colors.primaryHover,
    primaryColorPressed: colors.primaryPressed,
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

// ─── 主题色 CSS 变量注入 ───
// 把当前预设的主色三档写入 <html> 的自定义属性，供非 Naive 组件
// （Tab 下划线/字色、按钮、状态小字等 Tailwind/scoped CSS）直接引用 var(--app-primary)
function syncPrimaryCssVars() {
  const tokens = isDark.value ? activePreset.value.dark : activePreset.value.light
  const root = document.documentElement
  root.style.setProperty('--app-primary', tokens.primary)
  root.style.setProperty('--app-primary-hover', tokens.primaryHover)
  root.style.setProperty('--app-primary-pressed', tokens.primaryPressed)
  root.style.setProperty('--app-on-primary', activePreset.value.onColor)
}

// colorPreset / isDark 任一变化即重写 CSS 变量（immediate 保证冷启动即注入）
watch([colorPreset, isDark], syncPrimaryCssVars, { immediate: true })

provide('searchQuery', searchQuery)
provide('updateInfo', updateInfo)
provide('checkForUpdate', checkForUpdate)
provide('startDownloadUpdate', startDownloadUpdate)
provide('quitAndInstallUpdate', quitAndInstallUpdate)
provide('isDark', isDark)
provide('fontFamily', fontFamily)
provide('fontList', fontList)
provide('fontSize', fontSize)
provide('colorPreset', colorPreset)
provide('showSettings', showSettings)
provide('openTerminal', openTerminal)
provide('showTerminalDrawer', showTerminalDrawer)
provide('appDownloading', appDownloading)
provide('autoCheckUpdate', autoCheckUpdate)
provide('suppressUpdateToast', suppressUpdateToast)

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
      if (typeof theme.fontSize === 'number' && theme.fontSize > 0) fontSize.value = theme.fontSize
    }
  } catch { /* use defaults */ }

  // 从 config.json 加载自动检查更新配置
  try {
    const updateConfig = await window.scoopAPI.getConfig('update')
    if (updateConfig && typeof updateConfig.autoCheck === 'boolean') {
      autoCheckUpdate.value = updateConfig.autoCheck
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

  // electron-updater 事件流：统一驱动更新状态机（App 生命周期内常驻）
  window.scoopAPI.onUpdateEvent(handleUpdateEvent)

  await appStore.checkScoop()
  if (appStore.scoopStatus.installed) {
    await Promise.all([
      packagesStore.loadInstalled(),
      settingsStore.loadEnv(),
      settingsStore.loadCacheInfo(),
      settingsStore.checkAria2(),
      settingsStore.loadProxy(),
    ])

    // 异步自检：先执行 scoop update（更新 scoop 自身与 buckets），
    // 再执行 scoop status 同步可更新列表。整体异步，不阻塞初始渲染。
    packagesStore.refreshUpdatable()

    // 根据配置决定是否自动检查应用更新
    if (autoCheckUpdate.value) {
      checkForUpdate()
    }
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

// 全局正文字号变化时写入 CSS 变量 --app-font-size 并持久化
// 不用 immediate：初始值由 main.css 的 --app-font-size 兜底，onMounted 回显赋值时自然触发，
// 避免首次用默认值抢先写回磁盘、与异步 getConfig 回显竞态
watch(fontSize, (val) => {
  const px = Math.max(11, Math.min(20, Number(val) || 14))
  document.documentElement.style.setProperty('--app-font-size', `${px}px`)
  window.scoopAPI.setConfig('theme.fontSize', px)
})

function toggleTheme() {
  isDark.value = !isDark.value
  // syncHtmlDarkClass + persistence handled by watch(isDark)
}

function openSettings() {
  showSettings.value = true
}

function openTerminal() {
  showTerminalDrawer.value = true
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

              <div class="h-[calc(100vh-70px)] overflow-hidden w-full px-6 py-4 relative">
                <Dashboard v-show="!committedSearch.trim()" />
                <SearchPanel v-show="!!committedSearch.trim()" :query="committedSearch" />
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

        <!-- 全局更新通知弹窗 - 固定右下角 -->
        <UpdateManager />

        <SettingsPanel v-model:show="showSettings" />

        <!-- 全局终端日志流（单例，关闭不销毁，历史日志永久保留） -->
        <TerminalDrawer v-model:show="showTerminalDrawer" />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
</style>
