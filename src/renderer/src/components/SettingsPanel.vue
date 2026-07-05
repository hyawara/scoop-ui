<script setup lang="ts">
import { ref, inject, computed, watch, onMounted } from 'vue'
import {
  NButton,
  NIcon,
  NModal,
  NTag,
  NSpin,
  NProgress,
  NAutoComplete,
  NInput,
  NSwitch,
  useMessage,
} from 'naive-ui'
import {
  RefreshOutline,
  TerminalOutline,
  ColorPaletteOutline,
  TextOutline,
  CheckmarkCircleOutline,
  SunnyOutline,
  MoonOutline,
  LogoGithub,
  AddOutline,
  CloseOutline,
  ReorderThreeOutline,
  RocketOutline,
  SettingsOutline,
  FolderOpenOutline,
  GlobeOutline,
  ServerOutline,
  FlashOutline,
  LinkOutline,
  LayersOutline,
  EyeOutline,
  EyeOffOutline,
  LockClosedOutline,
  CheckmarkDoneOutline,
} from '@vicons/ionicons5'
import type { Ref } from 'vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const message = useMessage()

const isDark = inject<Ref<boolean>>('isDark')!
const fontList = inject<Ref<string[]>>('fontList')!
const colorPreset = inject<Ref<string>>('colorPreset')!

// 共享自更新状态机（由 App.vue 提供，electron-updater 事件流驱动）
const updateInfo = inject<any>('updateInfo')
const checkForUpdate = inject<() => Promise<void>>('checkForUpdate')
const startDownloadUpdate = inject<() => Promise<void>>('startDownloadUpdate')
const quitAndInstallUpdate = inject<() => void>('quitAndInstallUpdate')
const autoCheckUpdate = inject<Ref<boolean>>('autoCheckUpdate')!

const APP_VERSION = ref('')
const activeSidebar = ref('theme')

onMounted(async () => {
  APP_VERSION.value = (await window.scoopAPI.getAppVersion()) || '0.0.0'
})

// ═══ Sidebar nav items ═══
const sidebarNav = [
  { key: 'theme', label: '外观模式', icon: ColorPaletteOutline },
  { key: 'system', label: '系统设置', icon: SettingsOutline },
  { key: 'scoopconfig', label: 'Scoop 配置', icon: TerminalOutline },
]

// ═══ Color presets ═══
const colorPresets: Record<string, { name: string; primary: string }> = {
  aurora: { name: '极光紫', primary: '#7B6FF0' },
  ocean: { name: '海洋蓝', primary: '#3B82F6' },
  emerald: { name: '翠绿色', primary: '#10B981' },
  sunset: { name: '落日橙', primary: '#F59E0B' },
  rose: { name: '玫瑰红', primary: '#EC4899' },
}

// ═══ Font Config ═══
const fontInput = ref('')
const dragIndex = ref<number | null>(null)
const hoverIndex = ref<number | null>(null)

const commonFonts = [
  { label: 'Cascadia Code', value: 'Cascadia Code' },
  { label: 'Cascadia Mono', value: 'Cascadia Mono' },
  { label: 'Fira Code', value: 'Fira Code' },
  { label: 'Fira Mono', value: 'Fira Mono' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'JetBrains Mono NL', value: 'JetBrains Mono NL' },
  { label: 'Maple Mono NF', value: 'Maple Mono NF' },
  { label: 'Maple Mono', value: 'Maple Mono' },
  { label: 'Sarasa Term SC', value: 'Sarasa Term SC' },
  { label: 'Source Code Pro', value: 'Source Code Pro' },
  { label: 'Noto Sans SC', value: 'Noto Sans SC' },
  { label: 'Noto Sans Mono', value: 'Noto Sans Mono' },
  { label: 'Segoe UI', value: 'Segoe UI' },
  { label: 'Microsoft YaHei', value: 'Microsoft YaHei' },
  { label: 'Consolas', value: 'Consolas' },
  { label: 'HarmonyOS Sans', value: 'HarmonyOS Sans' },
]

const filteredSuggestions = computed(() => {
  const q = fontInput.value.toLowerCase().trim()
  if (!q) return commonFonts
  return commonFonts.filter(f => f.value.toLowerCase().includes(q))
})

function addFont() {
  const name = fontInput.value.trim()
  if (!name) return
  if (fontList.value.includes(name)) { fontInput.value = ''; return }
  fontList.value.push(name)
  fontInput.value = ''
}

function removeFont(index: number) {
  fontList.value.splice(index, 1)
}

function onDragStart(e: DragEvent, index: number) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(index))
  dragIndex.value = index
}

function onDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  if (dragIndex.value === null) return
  e.dataTransfer!.dropEffect = 'move'
  hoverIndex.value = index
}

function onDrop(e: DragEvent, index: number) {
  e.preventDefault()
  if (dragIndex.value === null || dragIndex.value === index) { dragIndex.value = null; hoverIndex.value = null; return }
  const item = fontList.value.splice(dragIndex.value, 1)[0]
  fontList.value.splice(index, 0, item)
  dragIndex.value = null
  hoverIndex.value = null
}

function onDragEnd() { dragIndex.value = null; hoverIndex.value = null }

// ═══ System Tab ═══
// 更新状态全部取自共享 updateInfo（App.vue 提供，electron-updater 事件流驱动）。
// 本组件只负责触发动作 + 按 phase 渲染 UI，不再维护本地副本状态。
const scoopVersion = ref('')
const scoopVersionLoading = ref(false)

// 派生视图状态：把共享 phase 映射为设置面板 UI 需要的状态
const updatePhase = computed(() => updateInfo?.value?.phase ?? 'idle')
const remoteVersion = computed(() => updateInfo?.value?.version ?? '')
const releaseNotes = computed(() => updateInfo?.value?.notes ?? '')
const downloadProgress = computed(() => updateInfo?.value?.percent ?? 0)

async function loadScoopVersion() {
  scoopVersionLoading.value = true
  try {
    const result = await window.scoopAPI.getScoopVersion()
    scoopVersion.value = result.version || '未知'
  } catch {
    scoopVersion.value = '未检测到'
  } finally { scoopVersionLoading.value = false }
}

async function handleCheckUpdate() {
  await checkForUpdate?.()
  const phase = updateInfo?.value?.phase
  if (phase === 'not-available') {
    message.info('当前已是最新版本')
  } else if (phase === 'available') {
    message.success(`发现新版本 v${updateInfo?.value?.version}`)
  } else if (phase === 'error') {
    message.error(`检查更新失败: ${updateInfo?.value?.error || '未知错误'}`)
  }
}

async function triggerAppUpgrade() {
  try {
    await startDownloadUpdate?.()
  } catch (e) {
    message.error(`更新失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function installUpdate() {
  quitAndInstallUpdate?.(true)
}

function selectPreset(key: string) {
  colorPreset.value = key
  window.scoopAPI.setConfig('theme.colorPreset', key)
}

function toggleAutoCheckUpdate(value: boolean) {
  autoCheckUpdate.value = value
  window.scoopAPI.setConfig('update.autoCheck', value)
}

function setTheme(dark: boolean) {
  isDark.value = dark
  // persistence handled by watch(isDark) in App.vue
}

// ═══ Scoop 配置管理 - ConfigItem 接口（纯只读展示）═══
interface ConfigItem {
  key: string
  label: string
  desc: string
  value: string
  isSensitive: boolean
}

const scoopConfigRaw = ref<Record<string, string>>({})
const configLoading = ref(false)

// gh_token 不在只读列表中重复展示，单独由可配置区管理
const configItems = computed<ConfigItem[]>(() =>
  Object.entries(scoopConfigRaw.value)
    .filter(([key]) => key !== 'gh_token')
    .map(([key, value]) => ({
      key,
      label: configMetaInfo[key]?.label || key,
      desc: configMetaInfo[key]?.description || '',
      value,
      isSensitive: false,
    }))
)

// ═══ GitHub Token 可配置区（仿主界面网络代理）═══
const ghToken = ref('')
const ghTokenSaving = ref(false)
const showGhToken = ref(false)
const ghTokenConfigured = computed(() => !!ghToken.value)

const configMetaInfo: Record<string, { icon: any; label: string; description: string }> = {
  'aria2-enabled': { icon: FlashOutline, label: 'Aria2 加速', description: '启用 Aria2 多线程下载加速' },
  'aria2-retry-wait': { icon: RefreshOutline, label: '重试等待', description: 'Aria2 下载失败重试等待秒数' },
  'aria2-split': { icon: LayersOutline, label: '连接数', description: 'Aria2 下载分片连接数' },
  'aria2-warn-enabled': { icon: FlashOutline, label: 'Aria2 警告', description: 'Aria2 警告信息开关' },
  'proxy': { icon: LinkOutline, label: '网络代理', description: 'Scoop 使用的代理地址' },
  'root_path': { icon: FolderOpenOutline, label: '安装根目录', description: 'Scoop 安装根目录路径' },
  'global_path': { icon: GlobeOutline, label: '全局目录', description: '全局安装目录路径' },
  'last_update': { icon: RocketOutline, label: '最近更新', description: 'Scoop 最近一次更新检查时间' },
  'architecture': { icon: ServerOutline, label: '默认架构', description: '默认下载架构 (64bit/32bit)' },
  'scoop_repo': { icon: LayersOutline, label: 'Scoop 仓库', description: 'Scoop 源码仓库地址' },
  'scoop_branch': { icon: LayersOutline, label: 'Scoop 分支', description: 'Scoop 更新分支' },
  'gh_token': { icon: LockClosedOutline, label: 'GitHub Token', description: 'GitHub 个人访问令牌，用于提高 API 速率限制' },
}

function getConfigIcon(key: string): any { return configMetaInfo[key]?.icon || SettingsOutline }
function getConfigLabel(key: string): string { return configMetaInfo[key]?.label || key }
function getConfigDesc(key: string): string { return configMetaInfo[key]?.description || '' }

function formatConfigValue(key: string, val: string): string {
  if (!val) return ''
  if (key === 'last_update') {
    try { return new Date(val).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
    catch { return val }
  }
  if (val.toLowerCase() === 'true') return '开启'
  if (val.toLowerCase() === 'false') return '关闭'
  return val
}

function displayValue(item: ConfigItem): string {
  if (!item.value) return ''
  return formatConfigValue(item.key, item.value)
}

async function loadScoopConfig() {
  configLoading.value = true
  try {
    const cfg = await window.scoopAPI.getScoopConfig()
    scoopConfigRaw.value = cfg
    ghToken.value = cfg['gh_token'] || ''
  } catch { /* scoop not available */ }
  configLoading.value = false
}

async function saveGhToken() {
  ghTokenSaving.value = true
  try {
    await window.scoopAPI.setScoopConfig('gh_token', ghToken.value.trim())
    const cfg = await window.scoopAPI.getScoopConfig()
    scoopConfigRaw.value = cfg
    ghToken.value = cfg['gh_token'] || ''
    message.success(ghToken.value ? 'GitHub Token 已保存并生效' : 'GitHub Token 已清除')
  } catch (e: any) {
    message.error('保存失败: ' + (e.message || String(e)))
  } finally {
    ghTokenSaving.value = false
  }
}

// ═══ Modal events ═══
function handleClose() {
  emit('update:show', false)
}

watch(() => props.show, (val) => {
  if (val) {
    activeSidebar.value = 'theme'
    loadScoopVersion()
    loadScoopConfig()
  }
  // 更新状态由共享 updateInfo 统一管理，设置面板开关不再重置本地副本
})
</script>

<template>
  <NModal
    :show="show"
    @update:show="handleClose"
    :mask-closable="true"
    :close-on-esc="true"
    transform-origin="center"
  >
    <!-- ═══ 三层 Viewport 隔离骨架 ═══ -->
    <!-- Layer 1: 弹窗外壳（固定且裁剪）overflow:hidden 一刀切断溢出 -->
    <div class="settings-modal-card" style="width: 780px; height: 560px; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; position: relative; box-shadow: 0 12px 32px rgba(0,0,0,0.24);">

      <div class="modal-header" style="height: 50px; padding: 0 24px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
        <span class="modal-header-title">设置</span>
        <div style="display: flex; align-items: center; gap: 12px;">
          <NButton text size="tiny" tag="a" href="https://github.com/hyawara/scoop-ui" target="_blank"
            class="!text-slate-400 hover:!text-cyan-400">
            <template #icon><NIcon :component="LogoGithub" size="12" /></template>GitHub
          </NButton>
          <NButton size="tiny" quaternary @click="handleClose" class="!rounded-lg">关闭</NButton>
        </div>
      </div>

      <!-- Layer 2: 整体内容容器（分栏）min-height:0 保证 Flex 高度链不塌陷 -->
      <div class="modal-body-wrapper" style="flex: 1; display: flex; flex-direction: row; min-height: 0; overflow: hidden;">

        <!-- 左侧固定侧栏（不滚动） -->
        <div class="modal-sidebar" style="width: 180px; height: 100%; padding: 16px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; box-sizing: border-box;">
          <button
            v-for="item in sidebarNav"
            :key="item.key"
            @click="activeSidebar = item.key"
            :class="['menu-item', activeSidebar === item.key ? 'active' : '']"
          >
            <NIcon :component="item.icon" size="16" class="flex-shrink-0" />
            <span>{{ item.label }}</span>
          </button>
        </div>

        <!-- Layer 3: 右侧独立视窗（滚动槽）overflow-y:auto + min-height:0 触发裁剪 -->
        <div class="modal-main-content-viewport" style="flex: 1; height: 100%; overflow-y: auto; overflow-x: hidden; padding: 24px; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0;">

          <div class="tab-panel-container" style="width: 100%; display: flex; flex-direction: column; gap: 20px;">

        <!-- ═══ Tab: 外观模式 ═══ -->
        <div v-if="activeSidebar === 'theme'" class="panel-fade-in">
          <div>
            <div class="flex items-center gap-2 mb-3">
              <SunnyOutline class="w-4 h-4 dark:text-slate-400 text-gray-500" />
              <span class="text-sm font-semibold dark:text-white text-gray-800">外观模式</span>
            </div>
            <div class="flex gap-2">
              <button @click="setTheme(true)"
                class="flex-1 flex items-center gap-3 p-3 rounded-xl transition-all duration-200 border"
                :class="isDark ? 'bg-emerald-500/10 border-emerald-500/30 dark:text-emerald-300 text-emerald-700' : 'dark:bg-white/[0.03] dark:border-white/[0.06] dark:text-slate-400 dark:hover:text-slate-300 bg-black/[0.02] border-black/[0.06] text-gray-600 hover:text-gray-800'">
                <MoonOutline class="w-5 h-5" />
                <div class="text-left">
                  <div class="text-sm font-medium">深色模式</div>
                  <div class="text-xs opacity-60">护眼，适合暗光环境</div>
                </div>
                <CheckmarkCircleOutline v-if="isDark" class="w-5 h-5 ml-auto text-emerald-400" />
              </button>
              <button @click="setTheme(false)"
                class="flex-1 flex items-center gap-3 p-3 rounded-xl transition-all duration-200 border"
                :class="!isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'dark:bg-white/[0.03] dark:border-white/[0.06] dark:text-slate-400 dark:hover:text-slate-300 bg-black/[0.02] border-black/[0.06] text-gray-600 hover:text-gray-800'">
                <SunnyOutline class="w-5 h-5" />
                <div class="text-left">
                  <div class="text-sm font-medium">浅色模式</div>
                  <div class="text-xs opacity-60">明亮，适合白天使用</div>
                </div>
                <CheckmarkCircleOutline v-if="!isDark" class="w-5 h-5 ml-auto text-emerald-400" />
              </button>
            </div>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-3">
              <ColorPaletteOutline class="w-4 h-4 dark:text-slate-400 text-gray-500" />
              <span class="text-sm font-semibold dark:text-white text-gray-800">UI 配色</span>
            </div>
            <div class="grid grid-cols-5 gap-2">
              <button v-for="(preset, key) in colorPresets" :key="key" @click="selectPreset(key)"
                class="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 border"
                :class="colorPreset === key ? 'dark:border-white/[0.15] dark:bg-white/[0.04] border-black/[0.15] bg-black/[0.04]' : 'border-transparent dark:bg-white/[0.02] dark:hover:bg-white/[0.04] bg-black/[0.02] hover:bg-black/[0.04]'">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center transition-transform"
                  :style="{ background: preset.primary }"
                  :class="{ 'scale-110 ring-2 ring-white/20': colorPreset === key }">
                  <CheckmarkCircleOutline v-if="colorPreset === key" class="w-4 h-4 text-white" />
                </div>
                <span class="text-[10px] dark:text-slate-400 text-gray-500">{{ preset.name }}</span>
              </button>
            </div>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-3">
              <TextOutline class="w-4 h-4 dark:text-slate-400 text-gray-500" />
              <span class="text-sm font-semibold dark:text-white text-gray-800">字体配置</span>
            </div>
            <p class="text-xs dark:text-slate-500 text-gray-500 mb-3 leading-relaxed">列表中第一种字体将被应用。若该字体不存在于当前设备上，则顺延至存在于当前设备上的字体。</p>
            <div class="flex gap-2 mb-4">
              <NAutoComplete v-model:value="fontInput" :options="filteredSuggestions" placeholder="输入或选择自定义字体名称..." size="small" class="flex-1" clearable @keyup.enter="addFont" />
              <NButton size="small" type="primary" @click="addFont" :disabled="!fontInput.trim()" class="!rounded-lg shrink-0">
                <template #icon><NIcon :component="AddOutline" size="16" /></template>添加
              </NButton>
            </div>
            <TransitionGroup name="font-stack" tag="div" class="flex flex-col gap-1">
              <div v-for="(font, index) in fontList" :key="font" draggable="true"
                @dragstart="onDragStart($event, index)" @dragover="onDragOver($event, index)"
                @drop="onDrop($event, index)" @dragend="onDragEnd"
                class="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-150 border cursor-default select-none"
                :class="[hoverIndex === index && dragIndex !== null && dragIndex !== index ? 'border-indigo-500/40 bg-indigo-500/8' : 'dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.06] border-black/[0.06] bg-black/[0.02] hover:bg-black/[0.04]']">
                <div class="cursor-grab active:cursor-grabbing dark:text-slate-500 text-gray-500 hover:text-slate-300 transition-colors touch-none">
                  <NIcon :component="ReorderThreeOutline" size="16" />
                </div>
                <span class="flex-1 text-sm truncate" :style="{ fontFamily: font }">{{ font }}</span>
                <button @click="removeFont(index)" class="opacity-0 group-hover:opacity-100 transition-all duration-150 text-red-400 hover:text-red-300 p-0.5 rounded">
                  <NIcon :component="CloseOutline" size="14" />
                </button>
              </div>
            </TransitionGroup>
            <div v-if="fontList.length === 0" class="text-center py-5 text-xs dark:text-slate-500 text-gray-500 dark:bg-white/[0.02] bg-black/[0.02] rounded-lg border border-dashed dark:border-white/[0.06] border-black/[0.06]">
              尚未添加字体，请通过上方输入框添加至少一种字体
            </div>
          </div>
        </div>

        <!-- ═══ Tab: 系统设置 ═══ -->
        <div v-if="activeSidebar === 'system'" class="panel-fade-in">
          <div class="flex items-center justify-between p-3 rounded-xl dark:bg-white/[0.03] dark:border-white/[0.06] bg-black/[0.02] border-black/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center"><span class="text-white text-xs font-bold">S</span></div>
              <div><span class="text-sm font-medium dark:text-white text-gray-800">Scoop UI</span><p class="text-xs dark:text-slate-400 text-gray-500">Scoop 包管理器图形界面</p></div>
            </div>
            <NTag size="small" :bordered="false" class="dark:!bg-white/[0.06] !bg-black/[0.04] dark:!text-slate-400 !text-gray-500 font-mono">v{{ APP_VERSION }}</NTag>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl dark:bg-white/[0.03] dark:border-white/[0.06] bg-black/[0.02] border-black/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center"><NIcon :component="TerminalOutline" size="18" class="text-white" /></div>
              <div><span class="text-sm font-medium dark:text-white text-gray-800">Scoop Core</span><p class="text-xs dark:text-slate-400 text-gray-500">底层包管理器引擎</p></div>
            </div>
            <template v-if="scoopVersionLoading"><NSpin :size="14" /></template>
            <template v-else><NTag size="small" :bordered="false" class="dark:!bg-white/[0.06] !bg-black/[0.04] dark:!text-slate-400 !text-gray-500 font-mono">{{ scoopVersion }}</NTag></template>
          </div>
          <div class="flex items-center justify-between p-3 rounded-xl dark:bg-white/[0.03] dark:border-white/[0.06] bg-black/[0.02] border-black/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"><NIcon :component="RefreshOutline" size="18" class="text-white" /></div>
              <div><span class="text-sm font-medium dark:text-white text-gray-800">检查更新</span><p class="text-xs dark:text-slate-400 text-gray-500">获取最新 Scoop UI 版本</p></div>
            </div>
            <NButton v-if="updatePhase === 'idle' || updatePhase === 'not-available' || updatePhase === 'error'" size="small" secondary type="warning" @click="handleCheckUpdate" class="!rounded-lg">
              <template #icon><NIcon :component="RefreshOutline" size="14" /></template>检查更新
            </NButton>
            <NButton v-else-if="updatePhase === 'checking'" size="small" loading disabled class="!rounded-lg">正在检查...</NButton>
            <div v-else-if="updatePhase === 'available'" class="flex flex-col items-end gap-1">
              <div class="flex items-center gap-2">
                <span class="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-mono">New v{{ remoteVersion }}</span>
                <NButton size="small" type="primary" @click="triggerAppUpgrade" class="!rounded-lg"><template #icon><NIcon :component="RocketOutline" size="14" /></template>立即更新</NButton>
              </div>
              <span v-if="releaseNotes" class="text-[11px] dark:text-slate-500 text-gray-500">更新日志：{{ releaseNotes }}</span>
            </div>
            <div v-else-if="updatePhase === 'downloading'" class="flex items-center gap-3">
              <div class="w-3.5 h-3.5 border-2 border-t-transparent border-blue-400 rounded-full animate-spin flex-shrink-0" />
              <span class="text-xs text-blue-300 font-mono min-w-[8em] whitespace-nowrap">{{ downloadProgress > 0 ? `正在下载 ${downloadProgress}%` : '准备下载...' }}</span>
              <NProgress type="line" :percentage="downloadProgress" :height="4" :border-radius="2" :show-indicator="false" status="info" style="width: 100px" />
            </div>
            <div v-else-if="updatePhase === 'downloaded'" class="flex items-center gap-2">
              <NButton size="small" type="primary" @click="installUpdate" class="!rounded-lg"><template #icon><NIcon :component="RocketOutline" size="14" /></template>重启并安装</NButton>
            </div>
          </div>
          <!-- 自动检查更新开关 -->
          <div class="flex items-center justify-between p-3 rounded-xl dark:bg-white/[0.03] dark:border-white/[0.06] bg-black/[0.02] border-black/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center"><NIcon :component="RefreshOutline" size="18" class="text-white" /></div>
              <div><span class="text-sm font-medium dark:text-white text-gray-800">自动检查更新</span><p class="text-xs dark:text-slate-400 text-gray-500">启动时自动检查新版本</p></div>
            </div>
            <NSwitch
              :value="autoCheckUpdate"
              @update:value="toggleAutoCheckUpdate"
              size="medium"
            />
          </div>
          <!-- ═══ 底部版权 (仅显示在系统设置中) ═══ -->
          <div class="mt-4 pt-3 text-center border-t dark:border-white/[0.06] border-black/[0.06]">
            <span class="text-xs dark:text-slate-500 text-gray-500">Scoop UI &copy; 2026</span>
          </div>
        </div>

        <!-- ═══ Tab: Scoop 配置 ═══ -->
        <div v-if="activeSidebar === 'scoopconfig'" class="panel-fade-in">
          <div v-if="configLoading" class="flex justify-center py-8">
            <div class="flex flex-col items-center gap-2">
              <div class="w-5 h-5 border-2 border-t-transparent border-emerald-500 rounded-full animate-spin" />
              <span class="text-xs dark:text-slate-400 text-gray-500">加载中...</span>
            </div>
          </div>

          <template v-else>
            <!-- ═══ GitHub Token 可配置区（仿主界面网络代理）═══ -->
            <div>
              <div class="flex items-center gap-2 mb-3">
                <LockClosedOutline class="w-4 h-4 dark:text-slate-400 text-gray-500" />
                <span class="text-sm font-semibold dark:text-white text-gray-800">GitHub Token</span>
                <span v-if="ghTokenConfigured"
                  class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-[10px] text-emerald-500 font-medium">
                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />已配置
                </span>
                <span v-else
                  class="px-1.5 py-0.5 rounded dark:bg-white/[0.06] bg-black/[0.04] text-[10px] dark:text-slate-400 text-gray-500 font-medium">未配置</span>
              </div>
              <p class="text-xs dark:text-slate-500 text-gray-500 mb-3 leading-relaxed">GitHub 个人访问令牌，用于提高 API 速率限制，避免频繁检查更新时被限流。留空并保存即可清除。</p>
              <div class="flex items-center gap-2 p-3 rounded-xl dark:bg-white/[0.03] dark:border-white/[0.06] bg-black/[0.02] border-black/[0.06] border">
                <div class="relative flex-1">
                  <NInput
                    v-model:value="ghToken"
                    size="small"
                    :type="showGhToken ? 'text' : 'password'"
                    placeholder="ghp_xxxxxxxxxxxxxxxx"
                    class="!w-full"
                    @keyup.enter="saveGhToken"
                  />
                  <button
                    @click="showGhToken = !showGhToken"
                    class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded dark:text-slate-400 text-gray-500 dark:hover:bg-white/[0.08] hover:bg-black/[0.06] z-10"
                  >
                    <NIcon :component="showGhToken ? EyeOffOutline : EyeOutline" size="15" />
                  </button>
                </div>
                <NButton size="small" type="primary" @click="saveGhToken" :loading="ghTokenSaving" class="!rounded-lg shrink-0">
                  <template #icon><NIcon :component="CheckmarkDoneOutline" size="15" /></template>保存
                </NButton>
              </div>
            </div>

            <!-- ═══ 其余配置项（纯只读展示）═══ -->
            <div v-if="configItems.length > 0" class="flex flex-col gap-1">
              <div class="flex items-center gap-2 mb-1">
                <SettingsOutline class="w-4 h-4 dark:text-slate-400 text-gray-500" />
                <span class="text-sm font-semibold dark:text-white text-gray-800">Scoop 配置</span>
                <span class="text-[10px] dark:text-slate-500 text-gray-400">只读</span>
              </div>
              <div v-for="item in configItems" :key="item.key"
                class="config-item-row"
              >
                <!-- Left: Icon + Label (no truncation) -->
                <div class="config-item-label">
                  <NIcon :component="getConfigIcon(item.key)" size="15" class="dark:text-slate-400 text-gray-500 flex-shrink-0 mt-0.5" />
                  <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-xs font-medium dark:text-white text-gray-800">{{ item.label }}</span>
                    <span v-if="item.desc" class="text-[10px] dark:text-slate-500 text-gray-400 leading-tight mt-0.5">{{ item.desc }}</span>
                  </div>
                </div>

                <!-- Right: Value (纯只读, no truncation, word-break) -->
                <div class="config-item-value">
                  <span class="config-item-display-value">{{ displayValue(item) }}</span>
                </div>
              </div>
            </div>

            <div v-else class="flex flex-col items-center py-8 dark:text-slate-500 text-gray-400">
              <SettingsOutline class="w-8 h-8 mb-2 opacity-40" />
              <p class="text-xs">Scoop 未安装或无法获取其余配置</p>
            </div>
          </template>
        </div>
        <!-- /scoopconfig tab -->

          </div><!-- /tab-panel-container -->
        </div><!-- /modal-main-content-viewport (Layer 3 滚动槽) -->
      </div><!-- /modal-body-wrapper (Layer 2 分栏) -->
    </div><!-- /settings-modal-card (Layer 1 外壳) -->

  </NModal>
</template>

<style scoped>
/* ─── Layer 1 外壳：明暗自适应背景 ─── */
.settings-modal-card {
  background-color: #ffffff;
}

.dark .settings-modal-card {
  background-color: #1e222b;
}

/* ─── Header：明暗自适应分割线 + 标题色 ─── */
.modal-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.dark .modal-header {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.modal-header-title {
  font-size: 16px;
  font-weight: 600;
  color: rgb(31, 41, 55);
}

.dark .modal-header-title {
  color: #ffffff;
}

/* ─── 侧栏：明暗自适应分割线 + 背景 ─── */
.modal-sidebar {
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  background-color: rgba(0, 0, 0, 0.02);
}

.dark .modal-sidebar {
  border-right-color: rgba(255, 255, 255, 0.04);
  background-color: rgba(0, 0, 0, 0.1);
}

/* ─── 侧栏菜单项 ─── */
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: rgba(0, 0, 0, 0.6);
  cursor: pointer;
  border: none;
  background: transparent;
  text-align: left;
  width: 100%;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.dark .menu-item {
  color: rgba(255, 255, 255, 0.6);
}

.menu-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.85);
}

.dark .menu-item:hover {
  background-color: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
}

.menu-item.active {
  background-color: rgba(16, 185, 129, 0.12);
  color: rgb(5, 150, 105);
  font-weight: 500;
}

.dark .menu-item.active {
  color: rgb(52, 211, 153);
}

/* ─── Tab 面板：垂直堆叠 + 淡入 ─── */
.panel-fade-in {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: panelFadeIn 0.25s ease;
}

@keyframes panelFadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ─── 配置项样式：去除截断，允许自然换行 ─── */
.config-item-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background-color: rgba(0,0,0,0.02);
  transition: background-color 0.15s;
}

.dark .config-item-row {
  background-color: rgba(255,255,255,0.02);
}

.config-item-label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  flex: 1;
  padding-top: 2px;
}

.config-item-value {
  flex-shrink: 0;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  max-width: 55%;
}

.config-item-edit {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
  width: 100%;
}

.config-item-edit-actions {
  display: flex;
  gap: 2px;
  padding-top: 2px;
}

.config-item-btn-save {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background-color: rgba(16,185,129,0.2);
  color: rgb(16,185,129);
  transition: background-color 0.15s;
}

.config-item-btn-save:hover {
  background-color: rgba(16,185,129,0.3);
}

.config-item-btn-cancel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: rgb(156,163,175);
  transition: background-color 0.15s;
}

.config-item-btn-cancel:hover {
  background-color: rgba(0,0,0,0.04);
}

.dark .config-item-btn-cancel:hover {
  background-color: rgba(255,255,255,0.06);
}

.config-item-display-value {
  font-size: 12px;
  color: rgb(107,114,128);
  font-family: monospace;
  text-align: right;
  word-break: break-all;
  overflow-wrap: anywhere;
  line-height: 1.4;
}

.dark .config-item-display-value {
  color: rgb(156,163,175);
}

.config-item-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  flex-shrink: 0;
  opacity: 0;
  color: rgb(156,163,175);
  transition: all 0.15s;
}

.config-item-row:hover .config-item-edit-btn {
  opacity: 1;
}

.config-item-edit-btn:hover {
  background-color: rgba(0,0,0,0.04);
}

.dark .config-item-edit-btn:hover {
  background-color: rgba(255,255,255,0.06);
}

/* ─── Font stack animations ─── */
.font-stack-move,
.font-stack-enter-active,
.font-stack-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.font-stack-enter-from,
.font-stack-leave-to {
  opacity: 0;
  transform: translateX(-16px);
}
.font-stack-leave-active {
  position: absolute;
}
</style>
