<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  NButton,
  NDrawer,
  NDrawerContent,
  useMessage,
} from 'naive-ui'
import { usePackagesStore } from '@/stores/packages'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const message = useMessage()
const packagesStore = usePackagesStore()
const fontFamily = inject<string>('fontFamily', '')
const rawLines = ref<string[]>([])

interface LogLine {
  text: string
  type: 'normal' | 'success' | 'error'
}

interface AppChapter {
  appName: string
  isHeader: boolean
  versionInfo?: string
  type: 'update' | 'install' | 'general'
  lines: LogLine[]
}

const MAX_LINES = 5000

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

const rawLogs = computed(() => rawLines.value.join('\n'))
const hasLogs = computed(() => rawLines.value.some(line => line.trim().length > 0))

// ─────────────────────────────────────────────────────────────
// 🧠 噪音净化规则：所有下载进度 / 长链接 / 计量信息在此被彻底拦截
// ─────────────────────────────────────────────────────────────
const ansiPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
const downloadUrlPattern = /\bDownloading\s+https?:\/\/\S+/i
const longUrlPattern = /https?:\/\/\S{64,}/i
const percentPattern = /(?:^|\s)\d{1,3}(?:\.\d+)?%|\b\d{1,3}\s*%\b/
const progressBarPattern = /\[[\s.=#>-]{6,}\]|[=━─■□▰▱█▓▒░]{5,}\s*(?:>|➔|=>)?/
const transferMetricPattern = /\b\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB)\s*\/\s*s\b|\b(?:KiB|MiB|GiB|KB|MB|GB)\/s\b/i
const sizeOnlyPattern = /\(\s*\d+(?:\.\d+)?\s*(?:KiB|MiB|GiB|KB|MB|GB)\s*\)/i
const carriageRefreshPattern = /^\s*(?:\d{1,3}(?:\.\d+)?%|\[[\s.=#>-]{3,}\]|[=━─■□▰▱█▓▒░]{3,})\s*$/
const updateHeaderPattern = /^Updating\s+'([^']+)'\s+\((.+)\)\s*$/i
const installHeaderPattern = /^Installing\s+'([^']+)'(?:\s+\((.+)\))?\s*$/i
const successPattern = /\bwas\s+(?:installed|updated|uninstalled)\s+successfully!?\b|\bsuccessfully!?$/i
const errorPattern = /^(?:ERROR:|Failed\b)/i
const lifecyclePattern = /^(?:Checking hash of|Extracting|Unlinking|Linking)\b/i

// 📦 章节卡片解析：按行拆解 rawLogs，过滤噪音后归类为 AppChapter[]
const parsedChapters = computed<AppChapter[]>(() => {
  const chapters: AppChapter[] = []
  let current: AppChapter | null = null

  const pushCurrent = () => {
    if (current && (current.isHeader || current.lines.length > 0)) {
      chapters.push(current)
    }
    current = null
  }

  const ensureGeneralChapter = () => {
    if (!current) {
      current = {
        appName: 'Scoop',
        isHeader: false,
        type: 'general',
        lines: [],
      }
    }
    return current
  }

  const appendLine = (text: string) => {
    const target = current ?? ensureGeneralChapter()
    const type: LogLine['type'] = errorPattern.test(text)
      ? 'error'
      : successPattern.test(text)
        ? 'success'
        : 'normal'

    target.lines.push({ text, type })
  }

  for (const rawLine of rawLogs.value.split(/\r?\n|\r/g)) {
    const text = rawLine.replace(ansiPattern, '').trim()
    // 🚫 纯 \r 触发的空行 / 原地刷新行：直接丢弃
    if (!text || carriageRefreshPattern.test(text)) continue

    // 📦 章节卡片头部锚点：Updating / Installing
    const updateMatch = text.match(updateHeaderPattern)
    if (updateMatch) {
      pushCurrent()
      current = {
        appName: updateMatch[1],
        isHeader: true,
        versionInfo: updateMatch[2].replace(/\s*->\s*/g, ' → '),
        type: 'update',
        lines: [],
      }
      continue
    }

    const installMatch = text.match(installHeaderPattern)
    if (installMatch) {
      pushCurrent()
      current = {
        appName: installMatch[1],
        isHeader: true,
        versionInfo: installMatch[2],
        type: 'install',
        lines: [],
      }
      continue
    }

    // 是否为对用户有知情权的核心生命周期行
    const isCoreLifecycleLine = lifecyclePattern.test(text)
      || errorPattern.test(text)
      || successPattern.test(text)

    // 🚫 噪音拦截器：下载链接 / 进度百分比 / 进度条 / 速度计量 / 纯文件大小
    const isNoisyDownloadLine = downloadUrlPattern.test(text)
      || longUrlPattern.test(text)
      || percentPattern.test(text)
      || progressBarPattern.test(text)
      || transferMetricPattern.test(text)
      || (sizeOnlyPattern.test(text) && !isCoreLifecycleLine)

    if (isNoisyDownloadLine) continue

    // 其余非进度常规提示文本（normal）一并保留
    appendLine(text)
  }

  pushCurrent()
  return chapters
})

const renderedLogs = computed(() => rawLogs.value)
const hasVisibleLogs = computed(() => parsedChapters.value.some(chapter => chapter.lines.length > 0 || chapter.isHeader))
const visibleLineCount = computed(() => parsedChapters.value.reduce((sum, chapter) => sum + chapter.lines.length + (chapter.isHeader ? 1 : 0), 0))

function commitLines(lines: string[]) {
  while (lines.length > 1 && lines[0] === '') lines.shift()
  if (lines.length > MAX_LINES) {
    lines = lines.slice(lines.length - MAX_LINES)
  }
  rawLines.value = lines
}

function replaceLastLine(text: string) {
  const lines = rawLines.value.length > 0 ? [...rawLines.value] : ['']
  lines[lines.length - 1] = text
  commitLines(lines)
}

function appendRawChunk(chunk: string) {
  if (!chunk) return
  const normalized = chunk.replace(/\r\n/g, '\n')

  // Scoop/Aria2 下载进度常用 \r 重绘同一行；若本块没有换行，直接覆盖末行，避免刷屏。
  if (normalized.includes('\r') && !normalized.includes('\n')) {
    replaceLastLine(normalized.slice(normalized.lastIndexOf('\r') + 1))
    return
  }

  const lines = rawLines.value.length > 0 ? [...rawLines.value] : ['']
  let current = lines.pop() ?? ''

  for (const ch of normalized) {
    if (ch === '\r') {
      current = ''
      continue
    }
    if (ch === '\n') {
      lines.push(current)
      current = ''
      continue
    }
    current += ch
  }

  lines.push(current)
  commitLines(lines)
}

function handleClear() {
  rawLines.value = []
  message.info('终端已清空')
}

function handleExport() {
  const blob = new Blob([
    `=== Scoop UI 原生日志 ===\n导出时间: ${new Date().toLocaleString()}\n\n${renderedLogs.value}`,
  ], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scoop-raw-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`
  a.click()
  URL.revokeObjectURL(url)
  message.success('日志已导出')
}

function handleClose() {
  visible.value = false
}

// ⚙️ 终态对齐：spawn 进程 close 后，静默触发全局数据刷新，主列表与真实安装状态对齐
function handleLogEnd() {
  packagesStore.loadInstalled()
  packagesStore.loadUpdatable()
}

onMounted(() => {
  window.scoopAPI.onLog((data) => {
    if (typeof data?.message === 'string') {
      appendRawChunk(data.message)
    }
  })
  window.scoopAPI.onLogEnd(() => handleLogEnd())
})

onBeforeUnmount(() => {
  window.scoopAPI.removeLogListener()
  window.scoopAPI.removeLogEndListener()
})
</script>

<template>
  <NDrawer
    v-model:show="visible"
    :width="760"
    placement="right"
    :mask-closable="true"
    :close-on-esc="true"
  >
    <NDrawerContent
      :native-scrollbar="false"
      body-content-style="padding:0;display:flex;flex-direction:column;height:100%;overflow:hidden"
    >
      <template #header>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-3">
            <span
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :class="hasLogs ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'"
            />
            <span class="font-mono text-sm font-semibold">Scoop 生命周期</span>
            <span class="text-xs opacity-50 font-mono">极简流 · {{ visibleLineCount }} 行</span>
          </div>
        </div>
      </template>

      <div
        class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden terminal-scroll bg-zinc-950 text-zinc-300 font-mono text-[13px]"
      >
        <div v-if="!hasVisibleLogs" class="terminal-empty">
          等待 Scoop 输出... 开始更新后，这里将显示纯净的生命周期日志。
        </div>

        <div v-else class="flex flex-col justify-start p-4 space-y-4">
          <div
            v-for="(chapter, ci) in parsedChapters"
            :key="ci"
            class="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-4"
          >
            <!-- 章节头部锚点 -->
            <div v-if="chapter.isHeader" class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-zinc-400 flex-shrink-0">📦</span>
                <span class="text-zinc-100 font-semibold truncate">
                  {{ chapter.type === 'install' ? '正在安装' : '正在更新' }} {{ chapter.appName }}
                </span>
              </div>
              <span
                v-if="chapter.versionInfo"
                class="bg-zinc-800 text-zinc-400 text-[11px] px-2 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap"
              >
                {{ chapter.versionInfo }}
              </span>
            </div>
            <div v-else class="flex items-center gap-2">
              <span class="text-zinc-500 text-[11px] uppercase tracking-wider">Scoop</span>
            </div>

            <div v-if="chapter.isHeader" class="border-b border-zinc-800/50 my-2.5" />

            <!-- 行级精细染色 -->
            <div class="space-y-0.5">
              <div
                v-for="(line, li) in chapter.lines"
                :key="li"
                :class="{
                  'text-zinc-400': line.type === 'normal',
                  'text-emerald-400 font-medium bg-emerald-500/5 px-1 rounded': line.type === 'success',
                  'text-red-400 bg-red-500/10 px-2 py-1.5 rounded-lg border-l-2 border-red-500 my-1 font-sans': line.type === 'error',
                }"
              >{{ line.text }}</div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <NButton quaternary size="small" @click="handleClear">清空</NButton>
            <NButton quaternary size="small" :disabled="!hasLogs" @click="handleExport">导出日志</NButton>
          </div>
          <NButton type="primary" @click="handleClose">关闭窗口</NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.terminal-scroll::-webkit-scrollbar {
  width: 6px;
}
.terminal-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.terminal-scroll::-webkit-scrollbar-thumb {
  background: #3f3f46;
  border-radius: 3px;
}
.terminal-scroll::-webkit-scrollbar-thumb:hover {
  background: #52525b;
}

.terminal-empty {
  padding-top: 96px;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  color: #52525b;
}
</style>
