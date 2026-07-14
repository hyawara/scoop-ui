<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NIcon,
  useMessage,
} from 'naive-ui'
import { CopyOutline, PlayCircleOutline, StopCircleOutline } from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import { APP_DRAWER_WIDTH } from '@/constants/layout'

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

interface CommandTask {
  id: number
  type: 'install' | 'uninstall' | 'update' | 'message'
  label: string
  packages: string[]
  startedAt: number
}

interface CommandState {
  active: boolean
  count: number
  tasks: CommandTask[]
}

interface SuggestedCommand {
  command: string
  source: string
  reason: string
}

const MAX_LINES = 5000
const LOCAL_TERMINAL_LOG_EVENT = 'scoop-ui:terminal-log'
const commandState = ref<CommandState>({ active: false, count: 0, tasks: [] })
const abortingCommand = ref(false)
const runningSuggestedCommand = ref('')
let removeExecuteCommandLog: (() => void) | null = null

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
const errorPattern = /(?:^|\b)(?:ERROR:?|ERR!|ERR\b|error\b|Failed\b|failure\b|fatal\b|exception\b|denied\b|permission\b|EPERM\b|EACCES\b|ENOENT\b|ETIMEDOUT\b|ECONNRESET\b|hash check failed|couldn'?t|cannot|can't|not found|npm\s+(?:ERR!|error)|pnpm\s+(?:ERR|error))/i
const lifecyclePattern = /^(?:Checking hash of|Extracting|Unlinking|Linking)\b/i
const commandContextPattern = /(?:run|execute|command|post[-\s]?install|after\s+install|context\s+menu|shell\s+extension|right[-\s]?click|suggest|recommend|执行|运行|命令|建议|推荐|注册|右键|上下文菜单|安装后|请先执行|请执行)/i
const promptPattern = /^(?:PS\s+[^>]+>|[A-Z]:\\[^>]*>|[$>])\s*/i
const allowedSuggestedCommandPatterns = [
  /^(?:sudo\s+)?scoop\s+(?:reset|uninstall|install|update|checkup|cleanup|config|bucket|list|status|search|info|cat|home|prefix|which|shim|export|import|hold|unhold|hold-check|virustotal|help)\b/i,
  /^(?:sudo\s+)?reg\s+(?:import|export|add|delete|query|copy|save|load|unload|restore|compare)\b/i,
  /^(?:sudo\s+)?netsh\b/i,
  /^shim\s+\S+/i,
  /^Set-ExecutionPolicy\s+/i,
  /^(?:mysqld|nginx|redis-server|redis-cli|node|npm|yarn|pnpm|python|pip|java|javac|gradle|maven|mvn)\s+\S+/i,
]
const commandPlaceholderPattern = /(?:<[^>]+>|\$\{[^}]+}|\.\.\.)/
const shellControlPattern = /(?:&&|\|\||[;|`])/

function cleanLogText(text: string) {
  return text.replace(ansiPattern, '').replace(/\r/g, '').trim()
}

function stripPrompt(text: string) {
  return text.replace(promptPattern, '').trim()
}

function normalizeCommandCandidate(candidate: string): string {
  let command = cleanLogText(candidate)
    .replace(/^[\-*•]\s+/, '')
    .replace(/^["'`]|["'`]$/g, '')
    .trim()

  command = stripPrompt(command)
    .replace(/[。.!！]+$/g, '')
    .trim()

  return command
}

function isAllowedSuggestedCommand(command: string): boolean {
  if (!command || command.length > 240) return false
  if (commandPlaceholderPattern.test(command)) return false
  if (shellControlPattern.test(command)) return false
  if (/^(?:checking|extracting|linking|unlinking|downloading|installing|updating|warning|warn|error)\b/i.test(command)) return false
  return allowedSuggestedCommandPatterns.some(pattern => pattern.test(command))
}

function collectInlineCommandCandidates(text: string): string[] {
  const candidates: string[] = []
  const quotedPattern = /(?:run|execute|command|执行|运行|命令|请先执行|请执行|建议|推荐)[^`'"]{0,48}[`'"]([^`'"]+)[`'"]/gi
  let quoted: RegExpExecArray | null
  while ((quoted = quotedPattern.exec(text)) !== null) {
    candidates.push(quoted[1])
  }

  const colonMatch = text.match(/(?:run|execute|command|执行|运行|命令|请先执行|请执行|建议|推荐)\s*[:：]\s*(.+)$/i)
  if (colonMatch?.[1]) {
    candidates.push(colonMatch[1])
  }

  return candidates
}

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
    const isNoisyDownloadLine = !isCoreLifecycleLine && (
      downloadUrlPattern.test(text)
      || longUrlPattern.test(text)
      || percentPattern.test(text)
      || progressBarPattern.test(text)
      || transferMetricPattern.test(text)
      || sizeOnlyPattern.test(text)
    )

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
const activeCommandText = computed(() => {
  if (!commandState.value.active) return '无运行命令'
  if (commandState.value.count > 1) return `${commandState.value.count} 个命令运行中`

  const task = commandState.value.tasks[0]
  if (!task) return 'Scoop 命令运行中'

  const actionMap: Record<CommandTask['type'], string> = {
    install: '安装',
    uninstall: '卸载',
    update: '更新',
    message: '执行',
  }
  return `${actionMap[task.type]} ${task.label}`
})
const suggestedCommands = computed<SuggestedCommand[]>(() => {
  const suggestions: SuggestedCommand[] = []
  const seen = new Set<string>()
  const lines = rawLogs.value.split(/\r?\n|\r/g)

  const pushSuggestion = (candidate: string, source: string, reason: string) => {
    const command = normalizeCommandCandidate(candidate)
    const key = command.toLowerCase()
    if (!isAllowedSuggestedCommand(command) || seen.has(key)) return
    seen.add(key)
    suggestions.push({ command, source, reason })
  }

  lines.forEach((rawLine, index) => {
    const text = cleanLogText(rawLine)
    if (!text) return

    const previousContext = [
      cleanLogText(lines[index - 2] || ''),
      cleanLogText(lines[index - 1] || ''),
      text,
    ].filter(Boolean).join(' ')
    const hasCommandContext = commandContextPattern.test(previousContext)
    const hasPrompt = promptPattern.test(text)
    const isIndented = /^\s{2,}\S/.test(rawLine)

    for (const inlineCandidate of collectInlineCommandCandidates(text)) {
      pushSuggestion(inlineCandidate, text, '内联建议')
    }

    const directCandidate = stripPrompt(text)
    if (hasPrompt || hasCommandContext || isIndented) {
      pushSuggestion(directCandidate, text, hasPrompt ? '终端命令' : '安装建议')
    }
  })

  return suggestions.slice(-6)
})

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

async function refreshCommandState() {
  try {
    commandState.value = await window.scoopAPI.getCommandState()
  } catch {
    commandState.value = { active: false, count: 0, tasks: [] }
  }
}

async function handleAbortCommand() {
  if (!commandState.value.active || abortingCommand.value) return
  abortingCommand.value = true
  try {
    const result = await window.scoopAPI.abortCommand()
    if (result.aborted > 0) {
      message.warning(`已发送中止请求（${result.aborted} 个命令）`)
    } else {
      message.info('当前没有正在运行的 Scoop 命令')
    }
  } catch (e: any) {
    message.error(e?.message || '中止命令失败')
  } finally {
    window.setTimeout(() => {
      abortingCommand.value = false
    }, 500)
  }
}

async function copySuggestedCommand(command: string) {
  try {
    await navigator.clipboard.writeText(command)
    message.success('命令已复制')
  } catch {
    message.error('复制失败')
  }
}

async function runSuggestedCommand(command: string) {
  if (runningSuggestedCommand.value) return
  runningSuggestedCommand.value = command
  appendRawChunk(`\n> ${command}\n`)
  try {
    await window.scoopAPI.executeCommand(command)
    message.success('命令执行完成')
  } catch (e: any) {
    appendRawChunk(`ERROR: 建议命令执行失败: ${e?.message || command}\n`)
    message.error(e?.message || '命令执行失败')
  } finally {
    runningSuggestedCommand.value = ''
  }
}

function handleLocalTerminalLog(event: Event) {
  const detail = (event as CustomEvent<{ message?: string }>).detail
  if (typeof detail?.message === 'string' && detail.message.trim()) {
    appendRawChunk(detail.message.endsWith('\n') ? detail.message : `${detail.message}\n`)
  }
}

// ⚙️ 终态对齐：spawn 进程 close 后，静默触发全局数据刷新，主列表与真实安装状态对齐
function handleLogEnd() {
  packagesStore.loadInstalled()
  packagesStore.loadUpdatable()
}

onMounted(() => {
  refreshCommandState()
  window.addEventListener(LOCAL_TERMINAL_LOG_EVENT, handleLocalTerminalLog)
  window.scoopAPI.onLog((data) => {
    if (typeof data?.message === 'string') {
      appendRawChunk(data.message)
    }
  })
  window.scoopAPI.onLogEnd(() => handleLogEnd())
  window.scoopAPI.onCommandState((state) => {
    commandState.value = state
    if (!state.active) abortingCommand.value = false
  })
  removeExecuteCommandLog = window.scoopAPI.onExecuteCommandLog((data) => {
    appendRawChunk(data.content)
  })
})

onBeforeUnmount(() => {
  window.scoopAPI.removeLogListener()
  window.scoopAPI.removeLogEndListener()
  window.scoopAPI.removeCommandStateListener()
  window.removeEventListener(LOCAL_TERMINAL_LOG_EVENT, handleLocalTerminalLog)
  removeExecuteCommandLog?.()
  removeExecuteCommandLog = null
})
</script>

<template>
  <NDrawer
    v-model:show="visible"
    :width="APP_DRAWER_WIDTH"
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
        class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden terminal-scroll bg-zinc-950 text-zinc-300 font-mono text-[13px] select-text"
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
        <div class="w-full space-y-2">
          <div v-if="suggestedCommands.length > 0" class="suggested-command-strip">
            <div class="suggested-command-title">建议命令</div>
            <div class="suggested-command-list">
              <div
                v-for="item in suggestedCommands"
                :key="item.command"
                class="suggested-command-item"
                :title="item.source"
              >
                <code>{{ item.command }}</code>
                <NButton
                  quaternary
                  circle
                  size="tiny"
                  title="复制命令"
                  @click="copySuggestedCommand(item.command)"
                >
                  <template #icon>
                    <NIcon :component="CopyOutline" />
                  </template>
                </NButton>
                <NButton
                  secondary
                  type="primary"
                  size="tiny"
                  :loading="runningSuggestedCommand === item.command"
                  :disabled="!!runningSuggestedCommand && runningSuggestedCommand !== item.command"
                  @click="runSuggestedCommand(item.command)"
                >
                  <template #icon>
                    <NIcon :component="PlayCircleOutline" />
                  </template>
                  运行
                </NButton>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between w-full">
            <div class="flex items-center gap-2 min-w-0">
              <NButton quaternary size="small" @click="handleClear">清空</NButton>
              <NButton quaternary size="small" :disabled="!hasLogs" @click="handleExport">导出日志</NButton>
              <NButton
                quaternary
                type="error"
                size="small"
                :disabled="!commandState.active || abortingCommand"
                :loading="abortingCommand"
                @click="handleAbortCommand"
              >
                <template #icon>
                  <NIcon :component="StopCircleOutline" />
                </template>
                中止
              </NButton>
              <span class="text-[11px] opacity-50 font-mono truncate max-w-[240px]">
                {{ activeCommandText }}
              </span>
            </div>
            <NButton type="primary" @click="handleClose">关闭窗口</NButton>
          </div>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.terminal-scroll::-webkit-scrollbar {
  width: 6px;
}
.terminal-scroll,
.terminal-scroll * {
  user-select: text;
  -webkit-user-select: text;
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

.suggested-command-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(113, 113, 122, 0.24);
  border-radius: 8px;
  background: rgba(24, 24, 27, 0.72);
}

.suggested-command-title {
  flex: 0 0 auto;
  color: #a1a1aa;
  font-size: 11px;
  font-weight: 600;
}

.suggested-command-list {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.suggested-command-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 220px;
  max-width: 420px;
  padding: 3px 4px 3px 8px;
  border: 1px solid rgba(82, 82, 91, 0.55);
  border-radius: 7px;
  background: rgba(39, 39, 42, 0.74);
}

.suggested-command-item code {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #d4d4d8;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  user-select: text;
  -webkit-user-select: text;
}
</style>
