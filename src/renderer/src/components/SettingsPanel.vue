<script setup lang="ts">
import { ref, inject, watch } from 'vue'
import {
  NButton,
  NIcon,
  NModal,
  NTag,
  NSpin,
  NTabs,
  NTabPane,
  NSelect,
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
} from '@vicons/ionicons5'
import type { Ref } from 'vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()

const message = useMessage()

const isDark = inject<Ref<boolean>>('isDark')!
const fontFamily = inject<Ref<string>>('fontFamily')!
const colorPreset = inject<Ref<string>>('colorPreset')!

const updateInfo = inject<any>('updateInfo')
const checkForUpdate = inject<() => Promise<void>>('checkForUpdate')

const APP_VERSION = '1.0.1'

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

const fontOptions = [
  { label: 'Iosevka Anony（默认）', value: "'IosevkaAnony','LXGW WenKai Mono','Segoe UI','Microsoft YaHei',sans-serif" },
  { label: 'LXGW WenKai Mono', value: "'LXGW WenKai Mono','Segoe UI',serif" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono','LXGW WenKai Mono',monospace" },
  { label: 'Cascadia Code', value: "'Cascadia Code','LXGW WenKai Mono',monospace" },
  { label: 'Fira Code', value: "'Fira Code','LXGW WenKai Mono',monospace" },
  { label: 'Maple Mono NF', value: "'Maple Mono NF','LXGW WenKai Mono',monospace" },
  { label: '系统默认', value: "'Segoe UI','Microsoft YaHei',sans-serif" },
]

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
  if (!checkForUpdate) return
  await checkForUpdate()
  if (updateInfo?.value?.hasUpdate) {
    message.success(`发现新版本 v${updateInfo.value.version}`)
  } else {
    message.info('当前已是最新版本')
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

function onFontChange(value: string) {
  fontFamily.value = value
  window.scoopAPI.setConfig('theme.fontFamily', value)
}

function handleClose() {
  emit('update:show', false)
}

watch(() => props.show, (val) => {
  if (val) {
    activeTab.value = 'theme'
    loadScoopVersion()
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
            <NSelect
              :value="fontFamily.value"
              :options="fontOptions"
              @update:value="onFontChange"
              filterable
              tag
              placeholder="选择或输入字体..."
            />
            <p class="text-xs text-slate-500 mt-2">
              支持输入自定义字体名称，多个字体用逗号分隔
            </p>
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
              size="small"
              secondary
              type="primary"
              :loading="updateInfo?.checking"
              @click="handleCheckUpdate"
              class="!rounded-lg"
            >
              <template #icon><NIcon :component="RefreshOutline" size="14" /></template>
              检查更新
            </NButton>
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
