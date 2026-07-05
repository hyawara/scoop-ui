<script setup lang="ts">
import { ref, inject, computed, watch, onMounted } from 'vue'
import {
  NButton,
  NIcon,
  NModal,
  NSpin,
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
  InformationCircleOutline,
  TimeOutline,
} from '@vicons/ionicons5'
import type { Ref } from 'vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const message = useMessage()

const isDark = inject<Ref<boolean>>('isDark')!
const fontList = inject<Ref<string[]>>('fontList')!
const colorPreset = inject<Ref<string>>('colorPreset')!

const updateInfo = inject<any>('updateInfo')
const checkForUpdate = inject<() => Promise<void>>('checkForUpdate')
const startDownloadUpdate = inject<() => Promise<void>>('startDownloadUpdate')
const quitAndInstallUpdate = inject<(isUpdate?: boolean) => void>('quitAndInstallUpdate')
const autoCheckUpdate = inject<Ref<boolean>>('autoCheckUpdate')!

const APP_VERSION = ref('')
const platformInfo = ref('Windows')

onMounted(async () => {
  APP_VERSION.value = (await window.scoopAPI.getAppVersion()) || '0.0.0'
  platformInfo.value = navigator.platform || 'Windows'
})
const activeSidebar = ref('theme')

const breadcrumbLabel = computed(() => {
  const map: Record<string, string> = {
    theme: '外观模式',
    system: '系统设置',
    scoopconfig: 'Scoop 配置',
  }
  return map[activeSidebar.value] || ''
})

const sidebarNav = [
  { key: 'theme', label: '外观模式', icon: ColorPaletteOutline },
  { key: 'system', label: '系统设置', icon: SettingsOutline },
  { key: 'scoopconfig', label: 'Scoop 配置', icon: TerminalOutline },
]

const colorPresets: Record<string, { name: string; primary: string }> = {
  aurora: { name: '极光紫', primary: '#7B6FF0' },
  ocean: { name: '海洋蓝', primary: '#3B82F6' },
  emerald: { name: '翠绿色', primary: '#10B981' },
  sunset: { name: '落日橙', primary: '#F59E0B' },
  rose: { name: '玫瑰红', primary: '#EC4899' },
}

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

const scoopVersion = ref('')
const scoopVersionLoading = ref(false)

const updatePhase = computed(() => updateInfo?.value?.phase ?? 'idle')
const remoteVersion = computed(() => updateInfo?.value?.version ?? '')
const releaseNotes = computed(() => updateInfo?.value?.notes ?? '')
const downloadProgress = computed(() => updateInfo?.value?.percent ?? 0)

// ═══ 更新状态机：四态管理 ═══
type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready'

const effectivePhase = computed<UpdateStatus>(() => {
  const raw = updatePhase.value
  if (raw === 'downloaded') return 'ready'
  if (raw === 'downloading') return 'downloading'
  if (raw === 'checking') return 'checking'
  if (raw === 'available') return 'idle'
  return 'idle'
})

const displayTransferred = computed(() => updateInfo?.value?.transferred ?? 0)
const displayTotal = computed(() => updateInfo?.value?.total ?? 0)
const displayPercent = computed(() => Math.round(downloadProgress.value))

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

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

function restartAndInstall() {
  if (simulating.value) {
    resetSim()
    message.info('模拟完成 — 实际环境中将退出并安装')
    return
  }
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
}

interface ConfigItem {
  key: string
  label: string
  desc: string
  value: string
  isSensitive: boolean
}

const scoopConfigRaw = ref<Record<string, string>>({})
const configLoading = ref(false)

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

function handleClose() {
  emit('update:show', false)
}

watch(() => props.show, (val) => {
  if (val) {
    activeSidebar.value = 'theme'
    loadScoopVersion()
    loadScoopConfig()
  }
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
    <div class="settings-shell">

      <div class="shell-header">
        <span class="shell-title">设置</span>
        <div class="shell-header-actions">
          <NButton text size="tiny" tag="a" href="https://github.com/hyawara/scoop-ui" target="_blank"
            class="!text-zinc-500 hover:!text-zinc-300 transition-colors">
            <template #icon><NIcon :component="LogoGithub" size="13" /></template>GitHub
          </NButton>
          <NButton size="tiny" quaternary @click="handleClose" class="!rounded-md">关闭</NButton>
        </div>
      </div>

      <div class="shell-body">

        <div class="shell-sidebar">
          <button
            v-for="item in sidebarNav"
            :key="item.key"
            @click="activeSidebar = item.key"
            :class="['nav-item', activeSidebar === item.key ? 'nav-item--active' : '']"
          >
            <NIcon :component="item.icon" size="16" class="flex-shrink-0" />
            <span>{{ item.label }}</span>
          </button>
        </div>

        <div class="shell-content">
          <div class="content-breadcrumb">
            <span class="bc-root">设置</span>
            <span class="bc-sep">/</span>
            <span class="bc-current">{{ breadcrumbLabel }}</span>
          </div>

          <div class="content-scroll">

            <!-- ═══════════════ Tab: 外观模式 ═══════════════ -->
            <div v-if="activeSidebar === 'theme'" class="tab-panel">

              <div class="setting-row setting-row--clickable" @click="setTheme(true)">
                <div class="setting-row__left">
                  <NIcon :component="MoonOutline" size="16" class="setting-icon" />
                  <div class="setting-text">
                    <span class="setting-title">深色模式</span>
                    <span class="setting-desc">护眼，适合暗光环境</span>
                  </div>
                </div>
                <NIcon v-if="isDark" :component="CheckmarkCircleOutline" size="16" class="text-emerald-400" />
              </div>

              <div class="setting-divider" />

              <div class="setting-row setting-row--clickable" @click="setTheme(false)">
                <div class="setting-row__left">
                  <NIcon :component="SunnyOutline" size="16" class="setting-icon" />
                  <div class="setting-text">
                    <span class="setting-title">浅色模式</span>
                    <span class="setting-desc">明亮，适合白天使用</span>
                  </div>
                </div>
                <NIcon v-if="!isDark" :component="CheckmarkCircleOutline" size="16" class="text-emerald-400" />
              </div>

              <div class="section-gap" />

              <div class="setting-row">
                <div class="setting-row__left">
                  <NIcon :component="ColorPaletteOutline" size="16" class="setting-icon" />
                  <div class="setting-text">
                    <span class="setting-title">UI 配色</span>
                    <span class="setting-desc">选择系统主色调</span>
                  </div>
                </div>
              </div>

              <div class="color-grid">
                <button v-for="(preset, key) in colorPresets" :key="key" @click="selectPreset(key)"
                  class="color-dot-wrapper"
                  :class="{ 'color-dot-wrapper--active': colorPreset === key }">
                  <div class="color-dot"
                    :style="{ background: preset.primary }"
                    :class="{ 'color-dot--active': colorPreset === key }">
                    <NIcon v-if="colorPreset === key" :component="CheckmarkCircleOutline" size="12" class="text-white" />
                  </div>
                  <span class="color-dot-label">{{ preset.name }}</span>
                </button>
              </div>

              <div class="section-gap" />

              <div class="setting-row">
                <div class="setting-row__left">
                  <NIcon :component="TextOutline" size="16" class="setting-icon" />
                  <div class="setting-text">
                    <span class="setting-title">字体配置</span>
                    <span class="setting-desc">列表中第一种可用字体将被应用，不存在则顺延</span>
                  </div>
                </div>
              </div>

              <div class="font-input-row">
                <NAutoComplete v-model:value="fontInput" :options="filteredSuggestions"
                  placeholder="输入或选择字体名称..." size="small" class="flex-1" clearable
                  @keyup.enter="addFont" />
                <NButton size="small" type="primary" @click="addFont" :disabled="!fontInput.trim()" class="!rounded-md shrink-0">
                  <template #icon><NIcon :component="AddOutline" size="15" /></template>添加
                </NButton>
              </div>

              <TransitionGroup name="font-stack" tag="div" class="font-list">
                <div v-for="(font, index) in fontList" :key="font" draggable="true"
                  @dragstart="onDragStart($event, index)" @dragover="onDragOver($event, index)"
                  @drop="onDrop($event, index)" @dragend="onDragEnd"
                  class="font-row"
                  :class="{ 'font-row--drag-over': hoverIndex === index && dragIndex !== null && dragIndex !== index }">
                  <div class="font-row__handle">
                    <NIcon :component="ReorderThreeOutline" size="15" />
                  </div>
                  <span class="font-row__name" :style="{ fontFamily: font }">{{ font }}</span>
                  <button @click="removeFont(index)" class="font-row__remove">
                    <NIcon :component="CloseOutline" size="14" />
                  </button>
                </div>
              </TransitionGroup>

              <div v-if="fontList.length === 0" class="font-empty">
                尚未添加字体，请通过上方输入框添加
              </div>
            </div>

            <!-- ═══════════════ Tab: 系统设置 ═══════════════ -->
            <div v-if="activeSidebar === 'system'" class="tab-panel">

              <!-- 区块 A：状态与版本信息 -->
              <div class="setting-row">
                <div class="setting-row__left">
                  <NIcon :component="InformationCircleOutline" size="16" class="setting-icon" />
                  <div class="setting-text">
                    <span class="setting-title">Scoop UI</span>
                    <span class="setting-desc">Scoop 包管理器图形界面</span>
                  </div>
                </div>
                <span class="version-badge">v{{ APP_VERSION }}</span>
              </div>

              <div class="setting-divider" />

              <div class="setting-row">
                <div class="setting-row__left">
                  <NIcon :component="TerminalOutline" size="16" class="setting-icon" />
                  <div class="setting-text">
                    <span class="setting-title">Scoop Core</span>
                    <span class="setting-desc">底层包管理器引擎</span>
                  </div>
                </div>
                <template v-if="scoopVersionLoading">
                  <NSpin :size="14" />
                </template>
                <template v-else>
                  <span class="version-badge">{{ scoopVersion }}</span>
                </template>
              </div>

              <div class="section-gap" />

              <!-- 区块 B：交互与操作项 — 检查更新（四态状态机） -->
              <div class="update-row-wrapper">
                <div class="setting-row">
                  <div class="setting-row__left">
                    <NIcon :component="RefreshOutline" size="16" class="setting-icon" />
                    <div class="setting-text">
                      <span class="setting-title">检查更新</span>
                      <span v-if="effectivePhase === 'ready'" class="setting-desc setting-desc--ready">新版本已准备就绪，重启应用即可完成升级</span>
                      <span v-else class="setting-desc">获取最新 Scoop UI 版本</span>
                    </div>
                  </div>

                  <!-- idle -->
                  <div v-if="effectivePhase === 'idle'" class="flex items-center gap-2">
                    <NButton size="small" quaternary @click="handleCheckUpdate" class="!rounded-md">
                      <template #icon><NIcon :component="RefreshOutline" size="14" /></template>检查更新
                    </NButton>
                  </div>

                  <!-- checking -->
                  <div v-else-if="effectivePhase === 'checking'" class="flex items-center gap-2">
                    <NButton size="small" quaternary loading disabled class="!rounded-md">检查中...</NButton>
                  </div>

                  <!-- downloading -->
                  <div v-else-if="effectivePhase === 'downloading'" class="flex items-center gap-2">
                    <div class="update-spinner" />
                    <span class="update-percent">{{ displayPercent }}%</span>
                    <NButton size="small" quaternary disabled class="!rounded-md">正在下载...</NButton>
                  </div>

                  <!-- ready -->
                  <div v-else-if="effectivePhase === 'ready'" class="flex items-center gap-2">
                    <NButton size="small" type="primary" @click="restartAndInstall" class="!rounded-md update-ready-btn">
                      <template #icon><NIcon :component="RocketOutline" size="14" /></template>重启并更新
                    </NButton>
                  </div>
                </div>

                <!-- 进度条区域：downloading 时展开 -->
                <Transition name="progress-slide">
                  <div v-if="effectivePhase === 'downloading'" class="update-progress-track">
                    <div class="progress-bar-shell">
                      <div class="progress-bar-fill" :style="{ width: displayPercent + '%' }" />
                    </div>
                    <span class="progress-meta">
                      {{ formatBytes(displayTransferred) }} / {{ formatBytes(displayTotal) }}
                    </span>
                  </div>
                </Transition>
              </div>

              <div class="setting-divider" />

              <div class="setting-row">
                <div class="setting-row__left">
                  <NIcon :component="TimeOutline" size="16" class="setting-icon" />
                  <div class="setting-text">
                    <span class="setting-title">自动检查更新</span>
                    <span class="setting-desc">启动时自动检查新版本</span>
                  </div>
                </div>
                <NSwitch :value="autoCheckUpdate" @update:value="toggleAutoCheckUpdate" size="medium" />
              </div>
            </div>

            <!-- ═══════════════ Tab: Scoop 配置 ═══════════════ -->
            <div v-if="activeSidebar === 'scoopconfig'" class="tab-panel">

              <div v-if="configLoading" class="config-loading">
                <div class="config-loading-spinner" />
                <span class="config-loading-text">加载中...</span>
              </div>

              <template v-else>

                <div class="setting-row">
                  <div class="setting-row__left">
                    <NIcon :component="LockClosedOutline" size="16" class="setting-icon" />
                    <div class="setting-text">
                      <span class="setting-title">GitHub Token</span>
                      <span class="setting-desc">GitHub 个人访问令牌，用于提高 API 速率限制</span>
                    </div>
                  </div>
                  <span v-if="ghTokenConfigured" class="token-badge token-badge--active">
                    <span class="token-badge-dot" />已配置
                  </span>
                  <span v-else class="token-badge">未配置</span>
                </div>

                <div class="token-input-row">
                  <div class="token-input-wrapper">
                    <NInput v-model:value="ghToken" size="small"
                      :type="showGhToken ? 'text' : 'password'"
                      placeholder="ghp_xxxxxxxxxxxxxxxx"
                      class="!w-full"
                      @keyup.enter="saveGhToken" />
                    <button @click="showGhToken = !showGhToken" class="token-eye-btn">
                      <NIcon :component="showGhToken ? EyeOffOutline : EyeOutline" size="15" />
                    </button>
                  </div>
                  <NButton size="small" type="primary" @click="saveGhToken" :loading="ghTokenSaving"
                    class="!rounded-md shrink-0">
                    <template #icon><NIcon :component="CheckmarkDoneOutline" size="15" /></template>保存
                  </NButton>
                </div>

                <div v-if="configItems.length > 0" class="config-list">
                  <div v-for="item in configItems" :key="item.key" class="setting-row">
                    <div class="setting-row__left">
                      <NIcon :component="getConfigIcon(item.key)" size="15" class="setting-icon" />
                      <div class="setting-text">
                        <span class="setting-title">{{ item.label }}</span>
                        <span v-if="item.desc" class="setting-desc">{{ item.desc }}</span>
                      </div>
                    </div>
                    <span class="config-value">{{ displayValue(item) }}</span>
                  </div>
                </div>

                <div v-else class="config-empty">
                  <NIcon :component="SettingsOutline" size="28" class="opacity-30" />
                  <p>Scoop 未安装或无法获取其余配置</p>
                </div>
              </template>
            </div>

            <!-- 环境脚标 -->
            <div class="content-footer">
              <span>Scoop UI © 2026</span>
              <span class="footer-sep">·</span>
              <span>{{ platformInfo }}</span>
            </div>

          </div><!-- /content-scroll -->
        </div><!-- /shell-content -->
      </div><!-- /shell-body -->
    </div><!-- /settings-shell -->
  </NModal>
</template>

<style scoped>
/* ═══════════════════════════════════════════════
   1. Shell 骨架
   ═══════════════════════════════════════════════ */
.settings-shell {
  width: 780px;
  height: 560px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  background: #ffffff;
}
.dark .settings-shell {
  background: #181c25;
}

/* ═══════════════════════════════════════════════
   2. Header
   ═══════════════════════════════════════════════ */
.shell-header {
  height: 48px;
  padding: 0 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.dark .shell-header {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.shell-title {
  font-size: 14px;
  font-weight: 600;
  color: rgb(31, 41, 55);
}
.dark .shell-title {
  color: rgba(255, 255, 255, 0.92);
}

.shell-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ═══════════════════════════════════════════════
   3. Body (Sidebar + Content)
   ═══════════════════════════════════════════════ */
.shell-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ═══════════════════════════════════════════════
   4. Sidebar
   ═══════════════════════════════════════════════ */
.shell-sidebar {
  width: 176px;
  height: 100%;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.015);
  box-sizing: border-box;
}
.dark .shell-sidebar {
  border-right-color: rgba(255, 255, 255, 0.05);
  background: rgba(0, 0, 0, 0.12);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  border: none;
  background: transparent;
  text-align: left;
  width: 100%;
  transition: background-color 0.12s ease, color 0.12s ease;
  position: relative;
}
.dark .nav-item {
  color: rgba(255, 255, 255, 0.5);
}

.nav-item:hover {
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.8);
}
.dark .nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.85);
}

.nav-item--active {
  background: rgba(16, 185, 129, 0.1);
  color: rgb(5, 150, 105);
  font-weight: 500;
}
.dark .nav-item--active {
  color: rgb(52, 211, 153);
}

/* ═══════════════════════════════════════════════
   5. Content Area
   ═══════════════════════════════════════════════ */
.shell-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.content-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 14px 28px 0;
  flex-shrink: 0;
}
.bc-root {
  color: rgba(0, 0, 0, 0.22);
}
.dark .bc-root {
  color: rgba(255, 255, 255, 0.22);
}
.bc-sep {
  color: rgba(0, 0, 0, 0.12);
}
.dark .bc-sep {
  color: rgba(255, 255, 255, 0.12);
}
.bc-current {
  color: rgba(0, 0, 0, 0.4);
  font-weight: 500;
}
.dark .bc-current {
  color: rgba(255, 255, 255, 0.38);
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 28px 0;
  min-height: 0;
}

.content-scroll::-webkit-scrollbar {
  width: 5px;
}
.content-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.content-scroll::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}
.content-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.18);
}
.dark .content-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
}
.dark .content-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* ═══════════════════════════════════════════════
   6. Tab Panel 动画
   ═══════════════════════════════════════════════ */
.tab-panel {
  display: flex;
  flex-direction: column;
  animation: tabFadeIn 0.2s ease;
}

@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ═══════════════════════════════════════════════
   7. Setting Row — VS Code 聚焦逻辑
   ═══════════════════════════════════════════════ */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  position: relative;
  transition: background-color 0.12s ease;
  gap: 12px;
}

.setting-row--clickable {
  cursor: pointer;
}

.setting-row:hover {
  background: rgba(0, 0, 0, 0.025);
}
.dark .setting-row:hover {
  background: rgba(255, 255, 255, 0.025);
}

/* 左侧翡翠绿指示线 */
.setting-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: 1px;
  background: #10B981;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.setting-row:hover::before {
  opacity: 1;
}

.setting-row__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.setting-icon {
  color: rgba(0, 0, 0, 0.32);
  flex-shrink: 0;
}
.dark .setting-icon {
  color: rgba(255, 255, 255, 0.28);
}

.setting-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.setting-title {
  font-size: 13px;
  font-weight: 500;
  color: rgb(24, 24, 27);
  line-height: 1.3;
}
.dark .setting-title {
  color: rgba(255, 255, 255, 0.9);
}

.setting-desc {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.35);
  line-height: 1.3;
}
.dark .setting-desc {
  color: rgba(255, 255, 255, 0.3);
}

/* ═══════════════════════════════════════════════
   8. Divider — 极其克制的分割线
   ═══════════════════════════════════════════════ */
.setting-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.05);
  margin: 0 12px;
}
.dark .setting-divider {
  background: rgba(255, 255, 255, 0.05);
}

.section-gap {
  height: 12px;
}

/* ═══════════════════════════════════════════════
   9. Version Badge — 等宽字体标签
   ═══════════════════════════════════════════════ */
.version-badge {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(16, 185, 129, 0.06);
  color: rgba(16, 185, 129, 0.75);
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.4;
}
.dark .version-badge {
  background: rgba(52, 211, 153, 0.08);
  color: rgba(52, 211, 153, 0.85);
}

/* ═══════════════════════════════════════════════
   10b. 更新行：进度条 & 就绪状态
   ═══════════════════════════════════════════════ */
.update-row-wrapper {
  border-radius: 6px;
}

.update-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(16, 185, 129, 0.18);
  border-top-color: rgba(16, 185, 129, 0.75);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.update-percent {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: rgba(16, 185, 129, 0.85);
  min-width: 2.5em;
  white-space: nowrap;
}
.dark .update-percent {
  color: rgba(52, 211, 153, 0.9);
}

/* — 进度条轨道 — */
.update-progress-track {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 10px 38px;
  overflow: hidden;
}

.progress-bar-shell {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(16, 185, 129, 0.1);
  overflow: hidden;
}
.dark .progress-bar-shell {
  background: rgba(52, 211, 153, 0.1);
}

.progress-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #10B981, #34D399);
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: width;
}
.dark .progress-bar-fill {
  background: linear-gradient(90deg, #10B981, #6EE7B7);
}

.progress-meta {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 10px;
  color: rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  flex-shrink: 0;
}
.dark .progress-meta {
  color: rgba(255, 255, 255, 0.25);
}

/* — 进度条 slide-fade 过渡 — */
.progress-slide-enter-active {
  transition: opacity 0.25s ease, max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 60px;
  opacity: 1;
}
.progress-slide-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 60px;
  opacity: 1;
}
.progress-slide-enter-from {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.progress-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

/* — Ready 呼吸灯按钮 — */
.update-ready-btn {
  animation: readyPulse 2s ease-in-out infinite;
}

@keyframes readyPulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
  }
}
.dark .update-ready-btn {
  animation-name: readyPulseDark;
}
@keyframes readyPulseDark {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.3);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(52, 211, 153, 0);
  }
}

/* — Ready 绿色描述文案 — */
.setting-desc--ready {
  color: rgb(16, 185, 129) !important;
}
.dark .setting-desc--ready {
  color: rgb(52, 211, 153) !important;
}

/* ═══════════════════════════════════════════════
   11. Color Grid
   ═══════════════════════════════════════════════ */
.color-grid {
  display: flex;
  gap: 16px;
  padding: 8px 12px 4px;
}

.color-dot-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
}

.color-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  border: 2px solid transparent;
}
.color-dot:hover {
  transform: scale(1.12);
}
.color-dot--active {
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);
}
.dark .color-dot--active {
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.25);
}

.color-dot-label {
  font-size: 10px;
  color: rgba(0, 0, 0, 0.35);
}
.dark .color-dot-label {
  color: rgba(255, 255, 255, 0.3);
}

/* ═══════════════════════════════════════════════
   12. Font Input & List
   ═══════════════════════════════════════════════ */
.font-input-row {
  display: flex;
  gap: 8px;
  padding: 4px 12px 0;
}

.font-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px 0;
}

.font-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 5px;
  transition: background-color 0.12s ease;
  border: 1px solid transparent;
}
.font-row:hover {
  background: rgba(0, 0, 0, 0.025);
}
.dark .font-row:hover {
  background: rgba(255, 255, 255, 0.03);
}
.font-row--drag-over {
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.04);
}

.font-row__handle {
  color: rgba(0, 0, 0, 0.2);
  cursor: grab;
  flex-shrink: 0;
  transition: color 0.12s ease;
}
.dark .font-row__handle {
  color: rgba(255, 255, 255, 0.18);
}
.font-row:hover .font-row__handle {
  color: rgba(0, 0, 0, 0.4);
}
.dark .font-row:hover .font-row__handle {
  color: rgba(255, 255, 255, 0.35);
}

.font-row__name {
  flex: 1;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.7);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dark .font-row__name {
  color: rgba(255, 255, 255, 0.7);
}

.font-row__remove {
  opacity: 0;
  color: rgba(239, 68, 68, 0.6);
  cursor: pointer;
  background: none;
  border: none;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
}
.font-row:hover .font-row__remove {
  opacity: 1;
}
.font-row__remove:hover {
  color: rgb(239, 68, 68);
  background: rgba(239, 68, 68, 0.08);
}

.font-empty {
  text-align: center;
  padding: 20px 12px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.3);
  border: 1px dashed rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  margin: 8px 12px 0;
}
.dark .font-empty {
  color: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.06);
}

/* ═══════════════════════════════════════════════
   13. Scoop Config — Token & Config List
   ═══════════════════════════════════════════════ */
.token-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  white-space: nowrap;
}
.dark .token-badge {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.3);
}

.token-badge--active {
  background: rgba(16, 185, 129, 0.08);
  color: rgba(16, 185, 129, 0.85);
}
.dark .token-badge--active {
  background: rgba(52, 211, 153, 0.1);
  color: rgba(52, 211, 153, 0.9);
}

.token-badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.token-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 0;
}

.token-input-wrapper {
  position: relative;
  flex: 1;
}

.token-eye-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  padding: 3px;
  border-radius: 4px;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.12s ease;
  z-index: 1;
}
.dark .token-eye-btn {
  color: rgba(255, 255, 255, 0.3);
}
.token-eye-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
.dark .token-eye-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.config-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 12px;
}

.config-value {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.35);
  text-align: right;
  word-break: break-all;
  line-height: 1.4;
  flex-shrink: 0;
  max-width: 50%;
}
.dark .config-value {
  color: rgba(255, 255, 255, 0.3);
}

.config-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
}

.config-loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(16, 185, 129, 0.15);
  border-top-color: rgba(16, 185, 129, 0.7);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.config-loading-text {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.3);
}
.dark .config-loading-text {
  color: rgba(255, 255, 255, 0.25);
}

.config-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 0;
  color: rgba(0, 0, 0, 0.25);
  gap: 8px;
}
.dark .config-empty {
  color: rgba(255, 255, 255, 0.2);
}
.config-empty p {
  font-size: 11px;
}

/* ═══════════════════════════════════════════════
   14. Footer — 极客环境脚标
   ═══════════════════════════════════════════════ */
.content-footer {
  padding: 16px 0 20px;
  margin-top: 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 10px;
  color: rgba(0, 0, 0, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  letter-spacing: 0.02em;
}
.dark .content-footer {
  border-top-color: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.15);
}

.footer-sep {
  opacity: 0.5;
}

/* ═══════════════════════════════════════════════
   15. Font Stack Transition
   ═══════════════════════════════════════════════ */
.font-stack-move,
.font-stack-enter-active,
.font-stack-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.font-stack-enter-from,
.font-stack-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}
.font-stack-leave-active {
  position: absolute;
}

/* ═══════════════════════════════════════════════
   16. Spin Animation
   ═══════════════════════════════════════════════ */
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
</style>
