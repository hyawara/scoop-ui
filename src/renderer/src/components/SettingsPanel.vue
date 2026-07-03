<script setup lang="ts">
import { ref, inject, computed, watch, onMounted } from 'vue'
import {
  NButton,
  NIcon,
  NModal,
  NTag,
  NSpin,
  NProgress,
  NTabs,
  NTabPane,
  NAutoComplete,
  useMessage,
} from 'naive-ui'
import {
  InformationCircleOutline,
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
} from '@vicons/ionicons5'
import type { Ref } from 'vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const message = useMessage()

const isDark = inject<Ref<boolean>>('isDark')!
const fontFamily = inject<Ref<string>>('fontFamily')!
const fontList = inject<Ref<string[]>>('fontList')!
const colorPreset = inject<Ref<string>>('colorPreset')!
const appDownloading = inject<any>('appDownloading')

const APP_VERSION = ref('')

onMounted(async () => {
  APP_VERSION.value = (await window.scoopAPI.getAppVersion()) || '0.0.0'
})

const UPDATE_CHECK_URL = 'https://github.com/hyawara/scoop-ui/releases/latest/download/update.json'
type UpdateStatus = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'restarting'
const updateStatus = ref<UpdateStatus>('idle')
const remoteVersion = ref('')
const releaseNotes = ref('')
const downloadUrl = ref('')
const zipUrl = ref('')
const downloadProgress = ref(0)

const scoopVersion = ref('')
const scoopVersionLoading = ref(false)
const activeTab = ref('theme')

const colorPresets: Record<string, { name: string; primary: string }> = {
  aurora: { name: '极光紫', primary: '#7B6FF0' },
  ocean: { name: '海洋蓝', primary: '#3B82F6' },
  emerald: { name: '翠绿色', primary: '#10B981' },
  sunset: { name: '落日橙', primary: '#F59E0B' },
  rose: { name: '玫瑰红', primary: '#EC4899' },
}

// ========== Font Fallback Chain ==========
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
  if (fontList.value.includes(name)) {
    fontInput.value = ''
    return
  }
  fontList.value.push(name)
  fontInput.value = ''
}

function removeFont(index: number) {
  fontList.value.splice(index, 1)
}

// Drag & Drop
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
  if (dragIndex.value === null || dragIndex.value === index) {
    dragIndex.value = null
    hoverIndex.value = null
    return
  }
  const item = fontList.value.splice(dragIndex.value, 1)[0]
  fontList.value.splice(index, 0, item)
  dragIndex.value = null
  hoverIndex.value = null
}

function onDragEnd() {
  dragIndex.value = null
  hoverIndex.value = null
}

async function loadScoopVersion() {
  scoopVersionLoading.value = true
  try {
    const result = await window.scoopAPI.getScoopVersion()
    scoopVersion.value = result.version || '未知'
  } catch {
    scoopVersion.value = '未检测到'
  } finally {
    scoopVersionLoading.value = false
  }
}

async function handleCheckUpdate() {
  updateStatus.value = 'checking'
  try {
    const result = await window.scoopAPI.checkForUpdate(UPDATE_CHECK_URL)
    if (result.error) {
      message.error(`检查更新失败: ${result.error}`)
      updateStatus.value = 'idle'
    } else if (result.hasUpdate) {
      remoteVersion.value = result.version || ''
      releaseNotes.value = result.notes || ''
      downloadUrl.value = result.downloadUrl || ''
      zipUrl.value = result.zipUrl || ''
      updateStatus.value = 'available'
      message.success(`发现新版本 v${result.version}`)
    } else {
      updateStatus.value = 'latest'
      message.info('当前已是最新版本')
    }
  } catch (e) {
    message.error(`检查更新失败: ${e instanceof Error ? e.message : String(e)}`)
    updateStatus.value = 'idle'
  }
}

async function triggerAppUpgrade() {
  if (!downloadUrl.value) return
  updateStatus.value = 'downloading'
  downloadProgress.value = 0
  if (appDownloading) appDownloading.value = true

  window.scoopAPI.onUpdateProgress((data: { percent: number }) => {
    downloadProgress.value = data.percent
  })

  try {
    const targetUrl = zipUrl.value || downloadUrl.value
    await window.scoopAPI.downloadUpdate(targetUrl)

    updateStatus.value = 'restarting'
    downloadProgress.value = 100
    message.success('下载完成，正在重启应用...')
    await new Promise(r => setTimeout(r, 1500))
    window.scoopAPI.startAppUpgrade()
  } catch (e) {
    message.error(`更新失败: ${e instanceof Error ? e.message : String(e)}`)
    if (appDownloading) appDownloading.value = false
    window.scoopAPI.removeUpdateProgressListener()
    updateStatus.value = 'available'
  }
}

function selectPreset(key: string) {
  colorPreset.value = key
  window.scoopAPI.setConfig('theme.colorPreset', key)
}

function toggleDark() {
  isDark.value = !isDark.value
  window.scoopAPI.setConfig('theme.dark', isDark.value)
}

function handleClose() {
  emit('update:show', false)
}

watch(() => props.show, (val) => {
  if (val) {
    activeTab.value = 'theme'
    loadScoopVersion()
  } else {
    updateStatus.value = 'idle'
    remoteVersion.value = ''
    releaseNotes.value = ''
    downloadUrl.value = ''
    zipUrl.value = ''
    downloadProgress.value = 0
  }
})
</script>

<template>
  <NModal
    :show="show"
    @update:show="handleClose"
    preset="card"
    title="设置"
    style="width: 520px"
    :closable="true"
    :mask-closable="true"
    :close-on-esc="true"
    :segmented="{ content: true }"
  >
    <NTabs v-model:value="activeTab" type="line" size="medium" :pane-style="{ paddingTop: '16px' }">
      <NTabPane name="theme" tab="主题设置">
        <div class="flex flex-col gap-5">
          <div>
            <div class="flex items-center gap-2 mb-3">
              <SunnyOutline class="w-4 h-4 text-slate-400" />
              <span class="text-sm font-semibold text-white">外观模式</span>
            </div>
            <div class="flex gap-2">
              <button
                @click="isDark ? toggleDark() : null"
                class="flex-1 flex items-center gap-3 p-3 rounded-xl transition-all duration-200 border"
                :class="isDark
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                  : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-slate-300'"
              >
                <MoonOutline class="w-5 h-5" />
                <div class="text-left">
                  <div class="text-sm font-medium">深色模式</div>
                  <div class="text-xs opacity-60">护眼，适合暗光环境</div>
                </div>
                <CheckmarkCircleOutline v-if="isDark" class="w-5 h-5 ml-auto text-indigo-400" />
              </button>
              <button
                @click="!isDark ? toggleDark() : null"
                class="flex-1 flex items-center gap-3 p-3 rounded-xl transition-all duration-200 border"
                :class="!isDark
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-slate-300'"
              >
                <SunnyOutline class="w-5 h-5" />
                <div class="text-left">
                  <div class="text-sm font-medium">浅色模式</div>
                  <div class="text-xs opacity-60">明亮，适合白天使用</div>
                </div>
                <CheckmarkCircleOutline v-if="!isDark" class="w-5 h-5 ml-auto text-amber-400" />
              </button>
            </div>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-3">
              <ColorPaletteOutline class="w-4 h-4 text-slate-400" />
              <span class="text-sm font-semibold text-white">UI 配色</span>
            </div>
            <div class="grid grid-cols-5 gap-2">
              <button
                v-for="(preset, key) in colorPresets"
                :key="key"
                @click="selectPreset(key)"
                class="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 border"
                :class="colorPreset === key
                  ? 'border-white/[0.15] bg-white/[0.04]'
                  : 'border-transparent bg-white/[0.02] hover:bg-white/[0.04]'"
              >
                <div
                  class="w-8 h-8 rounded-lg flex items-center justify-center transition-transform"
                  :style="{ background: preset.primary }"
                  :class="{ 'scale-110 ring-2 ring-white/20': colorPreset === key }"
                >
                  <CheckmarkCircleOutline v-if="colorPreset === key" class="w-4 h-4 text-white" />
                </div>
                <span class="text-[10px] text-slate-400">{{ preset.name }}</span>
              </button>
            </div>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-3">
              <TextOutline class="w-4 h-4 text-slate-400" />
              <span class="text-sm font-semibold text-white">字体配置</span>
            </div>

            <p class="text-xs text-slate-500 mb-3 leading-relaxed">
              列表中第一种字体将被应用。若该字体不存在于当前设备上，则顺延至存在于当前设备上的字体。
            </p>

            <div class="flex gap-2 mb-4">
              <NAutoComplete
                v-model:value="fontInput"
                :options="filteredSuggestions"
                placeholder="输入或选择自定义字体名称..."
                size="small"
                class="flex-1"
                clearable
                @keyup.enter="addFont"
              />
              <NButton
                size="small"
                type="primary"
                @click="addFont"
                :disabled="!fontInput.trim()"
                class="!rounded-lg shrink-0"
              >
                <template #icon><NIcon :component="AddOutline" size="16" /></template>
                添加
              </NButton>
            </div>

            <TransitionGroup
              name="font-stack"
              tag="div"
              class="flex flex-col gap-1"
            >
              <div
                v-for="(font, index) in fontList"
                :key="font"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover="onDragOver($event, index)"
                @drop="onDrop($event, index)"
                @dragend="onDragEnd"
                class="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-150 border cursor-default select-none"
                :class="[
                  hoverIndex === index && dragIndex !== null && dragIndex !== index
                    ? 'border-indigo-500/40 bg-indigo-500/8'
                    : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]'
                ]"
              >
                <div class="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 transition-colors touch-none">
                  <NIcon :component="ReorderThreeOutline" size="16" />
                </div>

                <span
                  class="flex-1 text-sm truncate"
                  :style="{ fontFamily: font }"
                >
                  {{ font }}
                </span>

                <button
                  @click="removeFont(index)"
                  class="opacity-0 group-hover:opacity-100 transition-all duration-150 text-red-400 hover:text-red-300 p-0.5 rounded"
                >
                  <NIcon :component="CloseOutline" size="14" />
                </button>
              </div>
            </TransitionGroup>

            <div
              v-if="fontList.length === 0"
              class="text-center py-5 text-xs text-slate-500 bg-white/[0.02] rounded-lg border border-dashed border-white/[0.06]"
            >
              尚未添加字体，请通过上方输入框添加至少一种字体
            </div>
          </div>
        </div>
      </NTabPane>

      <NTabPane name="system" tab="系统设置">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <span class="text-white text-xs font-bold">S</span>
              </div>
              <div>
                <span class="text-sm font-medium text-white">Scoop UI</span>
                <p class="text-xs text-slate-400">Scoop 包管理器图形界面</p>
              </div>
            </div>
            <NTag size="small" :bordered="false" class="!bg-white/[0.06] !text-slate-400 font-mono">
              v{{ APP_VERSION }}
            </NTag>
          </div>

          <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <NIcon :component="TerminalOutline" size="18" class="text-white" />
              </div>
              <div>
                <span class="text-sm font-medium text-white">Scoop Core</span>
                <p class="text-xs text-slate-400">底层包管理器引擎</p>
              </div>
            </div>
            <template v-if="scoopVersionLoading">
              <NSpin :size="14" />
            </template>
            <template v-else>
              <NTag size="small" :bordered="false" class="!bg-white/[0.06] !text-slate-400 font-mono">
                {{ scoopVersion }}
              </NTag>
            </template>
          </div>

          <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <NIcon :component="RefreshOutline" size="18" class="text-white" />
              </div>
              <div>
                <span class="text-sm font-medium text-white">检查更新</span>
                <p class="text-xs text-slate-400">获取最新 Scoop UI 版本</p>
              </div>
            </div>

            <NButton
              v-if="updateStatus === 'idle'"
              size="small"
              secondary
              type="warning"
              @click="handleCheckUpdate"
              class="!rounded-lg"
            >
              <template #icon><NIcon :component="RefreshOutline" size="14" /></template>
              检查更新
            </NButton>

            <NButton
              v-else-if="updateStatus === 'checking'"
              size="small"
              loading
              disabled
              class="!rounded-lg"
            >
              正在检查...
            </NButton>

            <div
              v-else-if="updateStatus === 'latest'"
              class="flex items-center gap-1.5 text-green-500 text-sm font-medium"
            >
              <NIcon :component="CheckmarkCircleOutline" size="16" />
              已是最新版本 (v{{ APP_VERSION }})
            </div>

            <div v-else-if="updateStatus === 'available'" class="flex flex-col items-end gap-1">
              <div class="flex items-center gap-2">
                <span class="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-mono">
                  New v{{ remoteVersion }}
                </span>
                <NButton
                  size="small"
                  type="primary"
                  @click="triggerAppUpgrade"
                  class="!rounded-lg"
                >
                  <template #icon><NIcon :component="RocketOutline" size="14" /></template>
                  立即更新
                </NButton>
              </div>
              <span v-if="releaseNotes" class="text-[11px] text-slate-500 truncate max-w-[200px]">
                更新日志：{{ releaseNotes }}
              </span>
            </div>

            <div v-else-if="updateStatus === 'downloading'" class="flex items-center gap-3">
              <div class="w-3.5 h-3.5 border-2 border-t-transparent border-blue-400 rounded-full animate-spin flex-shrink-0" />
              <span class="text-xs text-blue-300 font-mono min-w-[8em] whitespace-nowrap">
                {{ downloadProgress > 0 ? `正在下载 ${downloadProgress}%` : '准备下载...' }}
              </span>
              <NProgress
                type="line"
                :percentage="downloadProgress"
                :height="4"
                :border-radius="2"
                :show-indicator="false"
                status="info"
                style="width: 100px"
              />
            </div>

            <div v-else-if="updateStatus === 'restarting'" class="flex items-center gap-2">
              <div class="w-3.5 h-3.5 border-2 border-t-transparent border-green-400 rounded-full animate-spin flex-shrink-0" />
              <span class="text-xs text-green-400 font-mono animate-pulse">正在重启应用...</span>
            </div>
          </div>
        </div>
      </NTabPane>
    </NTabs>

    <template #footer>
      <div class="flex items-center justify-between">
        <span class="text-xs text-slate-500">Scoop UI &copy; 2026</span>
        <div class="flex items-center gap-2">
          <NButton
            text
            size="tiny"
            tag="a"
            href="https://github.com/hyawara/scoop-ui"
            target="_blank"
            class="!text-slate-400 hover:!text-cyan-400"
          >
            <template #icon><NIcon :component="LogoGithub" size="12" /></template>
            GitHub
          </NButton>
          <NButton size="tiny" quaternary @click="handleClose" class="!rounded-lg">关闭</NButton>
        </div>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
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
