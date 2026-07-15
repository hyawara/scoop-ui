<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NIcon,
  NPopconfirm,
  useMessage,
} from 'naive-ui'
import {
  DocumentTextOutline,
  DownloadOutline,
  StopCircleOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import { APP_DRAWER_WIDTH } from '@/constants/layout'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

// ─────────────────────────── 数据结构 ───────────────────────────

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

interface PipelineTask {
  name: string
  type: 'install' | 'update' | 'uninstall' | 'message'
  status: 'waiting' | 'running' | 'success' | 'error'
  versionInfo?: string
  order: number
}

interface UiLogLine {
  id: number
  text: string
  rowClass: string
}

const MAX_LINES = 8000
const LOCAL_TERMINAL_LOG_EVENT = 'scoop-ui:terminal-log'

const message = useMessage()
const packagesStore = usePackagesStore()
const injectedFontFamily = inject<Ref<string> | string>('fontFamily', '')
const drawerFontFamily = computed(() =>
  typeof injectedFontFamily === 'string' ? injectedFontFamily : injectedFontFamily.value
)

// 双通道日志：rawLogs 是 100% 原始终端行（导出使用），uiLogs 是清洗高亮后的展示行。
const rawLogs = ref<string[]>([])
const commandState = ref<CommandState>({ active: false, count: 0, tasks: [] })
const abortingCommand = ref(false)
const logContainerRef = ref<HTMLElement | null>(null)
const autoScroll = ref(true)

const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value),
})

// ─────────────────────────── 日志清洗与着色 ───────────────────────────

// 用 String.fromCharCode(27) 避免源码里出现字面控制符
const ansiPattern = new RegExp(String.fromCharCode(27) + '(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])', 'g')

// 高亮匹配语义
const errorPattern = /\b(?:ERROR|ERR!|WARN|failed|failure|fatal|exception|aborted|denied|permission|EPERM|EACCES|ENOENT|ETIMEDOUT|ECONNRESET|hash check failed|couldn'?t|cannot|can't|not found)\b/i
const successPattern = /\bwas\s+(?:installed|updated|uninstalled)\s+successfully!?|\bsuccessfully!?$|\b(completed|done)\b/i
const activePattern = /\b(Updating|Installing|Uninstalling|Extracting|Linking|Unlinking|Downloading)\b/i
const downloadProgressPattern = /download:\s*\[[#=\->_ .]+/i
const progressPattern = /^\s*(?:\[?[#=\->_ ]{3,}\]?|\d{1,3}%|\d+(?:\.\d+)?\s*[KMG]?i?B\/s)/i

// 流水线聚合用
const updateHeaderPattern = /^Updating\s+'([^']+)'\s*(?:\((.+)\))?/i
const installHeaderPattern = /^Installing\s+'([^']+)'(?:\s+\((.+)\))?/i
const uninstallHeaderPattern = /^Uninstalling\s+'?([^'\s]+)'?/i
const batchUpdatePattern = /Updating\s+\d+\s+outdated\s+apps?:\s*(.+)$/i

/**
 * 清洗单行：剥离 ANSI、去除开发调试前缀（ERROR RAW: stdout/stderr）与首尾反引号/空白。
 * 保留原始文本语义，不做任何截断，绝不吞行。
 */
function sanitizeLogLine(line: string): string {
  return line
    .replace(ansiPattern, '')
    .replace(/\r/g, '')
    .replace(/^ERROR RAW:\s*(?:stdout|stderr):\s*/i, '')
    .replace(/^ERROR RAW:\s*/i, '')
    .replace(/^(?:stdout|stderr):\s*/i, '')
    .replace(/^`+|`+$/g, '')
    .trimEnd()
}

const uiLogs = computed<UiLogLine[]>(() => {
  const result: UiLogLine[] = []
  const base = 'log-line'
  for (let i = 0; i < rawLogs.value.length; i++) {
    const text = sanitizeLogLine(rawLogs.value[i])
    if (!text) continue

    let rowClass = `${base} log-line--default`
    if (errorPattern.test(text)) {
      rowClass = `${base} log-line--error`
    } else if (successPattern.test(text)) {
      rowClass = `${base} log-line--success`
    } else if (downloadProgressPattern.test(text) || progressPattern.test(text)) {
      rowClass = `${base} log-line--progress`
    } else if (activePattern.test(text)) {
      rowClass = `${base} log-line--active`
    }

    result.push({ id: i, text, rowClass })
  }
  return result
})

const hasLogs = computed(() => uiLogs.value.length > 0)
const hasError = computed(() => uiLogs.value.some((line) => line.rowClass.includes('log-line--error')))

// ─────────────────────────── 任务流水线聚合 ───────────────────────────

const drawerPhase = computed<'idle' | 'running' | 'success' | 'error'>(() => {
  if (commandState.value.active) return 'running'
  if (hasError.value) return 'error'
  if (hasLogs.value) return 'success'
  return 'idle'
})

function splitPackageList(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
}

function parseSuccessApp(line: string): string {
  const quoted = line.match(/'([^']+)'\s+was\s+(?:installed|updated|uninstalled)\s+successfully/i)
  if (quoted?.[1]) return quoted[1]
  const loose = line.match(/^([A-Za-z0-9._+/-]+)\s+was\s+(?:installed|updated|uninstalled)\s+successfully/i)
  return loose?.[1] || ''
}

const pipelineTasks = computed<PipelineTask[]>(() => {
  const map = new Map<string, PipelineTask>()
  let order = 0
  let activeTaskName = ''

  const ensureTask = (
    name: string,
    type: PipelineTask['type'] = 'message',
    status: PipelineTask['status'] = 'waiting',
    versionInfo?: string
  ) => {
    const key = name.toLowerCase()
    const existing = map.get(key)
    if (existing) {
      existing.type = type === 'message' ? existing.type : type
      existing.versionInfo = versionInfo || existing.versionInfo
      if (existing.status !== 'success' && existing.status !== 'error') {
        existing.status = status
      }
      return existing
    }
    const task: PipelineTask = { name, type, status, versionInfo, order: order++ }
    map.set(key, task)
    return task
  }

  for (const task of commandState.value.tasks) {
    const names = task.packages.length > 0 ? task.packages : [task.label]
    for (const name of names.filter(Boolean)) {
      ensureTask(name, task.type, commandState.value.active ? 'waiting' : 'success')
    }
  }

  for (const line of uiLogs.value) {
    const text = line.text

    const batchMatch = text.match(batchUpdatePattern)
    if (batchMatch?.[1]) {
      for (const name of splitPackageList(batchMatch[1])) {
        ensureTask(name, 'update', 'waiting')
      }
      continue
    }

    const updateMatch = text.match(updateHeaderPattern)
    if (updateMatch?.[1]) {
      const task = ensureTask(updateMatch[1], 'update', 'running', updateMatch[2]?.replace(/\s*->\s*/g, ' → '))
      task.status = 'running'
      activeTaskName = task.name
      continue
    }

    const installMatch = text.match(installHeaderPattern)
    if (installMatch?.[1]) {
      const task = ensureTask(installMatch[1], 'install', 'running', installMatch[2])
      task.status = 'running'
      activeTaskName = task.name
      continue
    }

    const uninstallMatch = text.match(uninstallHeaderPattern)
    if (uninstallMatch?.[1]) {
      const task = ensureTask(uninstallMatch[1], 'uninstall', 'running')
      task.status = 'running'
      activeTaskName = task.name
      continue
    }

    if (successPattern.test(text)) {
      const successApp = parseSuccessApp(text) || activeTaskName
      if (successApp) {
        const task = ensureTask(successApp)
        task.status = 'success'
      }
      continue
    }

    if (line.rowClass.includes('log-line--error') && activeTaskName) {
      const task = ensureTask(activeTaskName)
      task.status = 'error'
    }
  }

  const tasks = [...map.values()].sort((a, b) => a.order - b.order)
  const runningIndex = tasks.findIndex((task) => task.status === 'running')

  if (!commandState.value.active) {
    for (const task of tasks) {
      if (task.status === 'running' || task.status === 'waiting') {
        task.status = hasError.value ? 'error' : 'success'
      }
    }
  } else if (runningIndex >= 0) {
    tasks.forEach((task, index) => {
      if (index > runningIndex && task.status !== 'success' && task.status !== 'error') {
        task.status = 'waiting'
      }
    })
  }

  return tasks
})

const runningTaskCount = computed(() => pipelineTasks.value.filter((task) => task.status === 'running').length)
const completedTaskCount = computed(() => pipelineTasks.value.filter((task) => task.status === 'success').length)
const failedTaskCount = computed(() => pipelineTasks.value.filter((task) => task.status === 'error').length)

const headerSummary = computed(() => {
  const total = pipelineTasks.value.length
  if (drawerPhase.value === 'idle') return '等待任务'
  if (drawerPhase.value === 'running') {
    return `${runningTaskCount.value} 个正在运行 / ${failedTaskCount.value} 个异常 / ${total} 总计`
  }
  if (drawerPhase.value === 'success') return `任务全部完成 · ${completedTaskCount.value} / ${total}`
  return `任务异常中断 · ${failedTaskCount.value} 失败 / ${total}`
})

const headerLabel = computed(() => {
  if (drawerPhase.value === 'running') return '任务状态'
  if (drawerPhase.value === 'success') return '任务完成'
  if (drawerPhase.value === 'error') return '任务异常'
  return '任务队列'
})

const headerLabelClass = computed(() => {
  if (drawerPhase.value === 'running') return 'text-sky-300'
  if (drawerPhase.value === 'success') return 'text-emerald-300'
  if (drawerPhase.value === 'error') return 'text-rose-300'
  return 'text-zinc-400'
})

// ─────────────────────────── 原始日志接入 ───────────────────────────

/**
 * 追加主进程推送的行段到 rawLogs。主进程已按 \r / \n 边界切段，这里只做追加/覆盖。
 *  - 独立 \r 段：进度覆盖 —— 覆盖 rawLogs 尾行
 *  - \n 结尾段：完整行落定入队
 *  - 无边界结尾段：拼接到尾行（继续攒下一段边界）
 */
function appendRawChunk(chunk: string) {
  if (!chunk) return
  const normalized = chunk.replace(/\r\n/g, '\n')
  const next = rawLogs.value.slice()

  if (normalized.endsWith('\r') && !normalized.includes('\n')) {
    const body = normalized.slice(0, -1)
    if (next.length === 0) next.push(body)
    else next[next.length - 1] = body
    rawLogs.value = next.slice(-MAX_LINES)
    return
  }

  let current = ''
  for (const char of normalized) {
    if (char === '\n') {
      next.push(current)
      current = ''
      continue
    }
    if (char === '\r') {
      next.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.length > 0) next.push(current)
  rawLogs.value = next.slice(-MAX_LINES)
}

// ─────────────────────────── 交互 ───────────────────────────

function handleClear() {
  rawLogs.value = []
  message.info('日志已清空')
}

function handleExport() {
  // 严格使用 100% 原始日志导出，界面高亮不影响文件内容
  const content = rawLogs.value.join('\n')
  const blob = new Blob([
    `=== Scoop UI 执行日志（终端原文） ===\n导出时间: ${new Date().toLocaleString()}\n\n${content}`,
  ], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `scoop-task-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`
  link.click()
  URL.revokeObjectURL(url)
  message.success('日志已导出（终端原文）')
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
  } catch (error: any) {
    message.error(error?.message || '中止命令失败')
  } finally {
    window.setTimeout(() => {
      abortingCommand.value = false
    }, 500)
  }
}

function handleLocalTerminalLog(event: Event) {
  const detail = (event as CustomEvent<{ message?: string }>).detail
  if (typeof detail?.message === 'string' && detail.message.trim()) {
    appendRawChunk(detail.message.endsWith('\n') ? detail.message : `${detail.message}\n`)
  }
}

function handleLogEnd() {
  void packagesStore.loadInstalled()
  void packagesStore.loadUpdatable()
  void refreshCommandState()
}

function taskStatusText(task: PipelineTask): string {
  if (task.status === 'success') {
    if (task.type === 'install') return '已安装'
    if (task.type === 'uninstall') return '已卸载'
    if (task.type === 'update') return '已更新'
    return '已完成'
  }
  if (task.status === 'error') return '异常'
  if (task.status === 'running') {
    if (task.type === 'install') return '安装中'
    if (task.type === 'uninstall') return '卸载中'
    if (task.type === 'update') return '更新中'
    return '执行中'
  }
  return '等待中'
}

function taskDotIcon(task: PipelineTask): string {
  if (task.status === 'success') return '🟢'
  if (task.status === 'error') return '🔴'
  if (task.status === 'running') return '🔵'
  return '⚪'
}

// ─────────────────────────── 自动滚动置底（平滑追踪） ───────────────────────────

function isNearBottom(el: HTMLElement | null, threshold = 80): boolean {
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function scrollToBottom(smooth = true) {
  const el = logContainerRef.value
  if (!el) return
  el.scrollTo({
    top: el.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

function handleScroll() {
  autoScroll.value = isNearBottom(logContainerRef.value)
}

watch(
  () => rawLogs.value.length,
  () => {
    if (!autoScroll.value) return
    void nextTick(() => scrollToBottom(true))
  }
)

watch(
  () => props.show,
  (next) => {
    if (next) {
      void nextTick(() => {
        autoScroll.value = true
        scrollToBottom(false)
      })
    }
  }
)

// ─────────────────────────── 生命周期 ───────────────────────────

onMounted(() => {
  refreshCommandState()
  window.addEventListener(LOCAL_TERMINAL_LOG_EVENT, handleLocalTerminalLog)
  window.scoopAPI.onLog((data) => {
    if (typeof data?.message === 'string') appendRawChunk(data.message)
  })
  window.scoopAPI.onLogEnd(() => handleLogEnd())
  window.scoopAPI.onCommandState((state) => {
    commandState.value = state
    if (!state.active) abortingCommand.value = false
  })
})

onBeforeUnmount(() => {
  window.scoopAPI.removeLogListener()
  window.scoopAPI.removeLogEndListener()
  window.scoopAPI.removeCommandStateListener()
  window.removeEventListener(LOCAL_TERMINAL_LOG_EVENT, handleLocalTerminalLog)
})
</script>

<template>
  <NDrawer
    v-model:show="visible"
    :width="APP_DRAWER_WIDTH"
    placement="right"
    :mask-closable="!commandState.active"
    :close-on-esc="!commandState.active"
    display-directive="show"
  >
    <NDrawerContent
      :native-scrollbar="false"
      header-style="display:none"
      body-content-style="padding:0;display:flex;flex-direction:column;height:100%;overflow:hidden;background:#0d0d10"
    >
      <div
        class="cmd-shell"
        :style="{ fontFamily: drawerFontFamily }"
      >
        <!-- ─── 顶栏：任务流水线充当 Header ─────────────────────────── -->
        <header class="pipeline-header">
          <div class="pipeline-header__row">
            <div class="pipeline-header__title min-w-0">
              <span class="pipeline-header__label" :class="headerLabelClass">{{ headerLabel }}</span>
              <span class="pipeline-header__arrow">➔</span>
              <span class="pipeline-header__summary">{{ headerSummary }}</span>
            </div>

            <div class="pipeline-header__badge" :class="drawerPhase === 'running' ? 'is-live' : 'is-idle'">
              <span class="live-dot" />
              <span>Live Stream</span>
            </div>
          </div>

          <div v-if="pipelineTasks.length > 0" class="pipeline-chips">
            <div
              v-for="task in pipelineTasks"
              :key="`${task.type}:${task.name}`"
              class="chip"
              :class="`chip--${task.status}`"
              :title="`${task.name}${task.versionInfo ? ' ' + task.versionInfo : ''} · ${taskStatusText(task)}`"
            >
              <span class="chip__dot">{{ taskDotIcon(task) }}</span>
              <span class="chip__name">{{ task.name }}</span>
              <span class="chip__status">{{ taskStatusText(task) }}</span>
            </div>
          </div>
        </header>

        <!-- ─── 主体：无缝平铺的真·控制台 ─────────────────────────── -->
        <div
          ref="logContainerRef"
          class="terminal"
          @scroll="handleScroll"
        >
          <div v-if="!hasLogs" class="terminal__empty">
            <span class="cursor">█</span>
            <span class="ml-2">等待 Scoop 输出...</span>
          </div>

          <div v-else class="terminal__stream">
            <div
              v-for="line in uiLogs"
              :key="line.id"
              :class="line.rowClass"
            >{{ line.text }}</div>
          </div>
        </div>

        <!-- ─── 悬浮"跳至最新"按钮：用户上翻时才浮出 ─── -->
        <button
          v-if="!autoScroll && hasLogs"
          class="scroll-follow"
          type="button"
          @click="() => { autoScroll = true; scrollToBottom(true) }"
        >
          跳至最新 ↓
        </button>
      </div>

      <!-- ─── 底部：操作栏 ─────────────────────────── -->
      <template #footer>
        <div class="flex items-center justify-between gap-3 w-full">
          <div class="flex items-center gap-2">
            <NButton tertiary size="small" :disabled="!hasLogs" @click="handleExport">
              <template #icon>
                <NIcon :component="DownloadOutline" />
              </template>
              导出原文
            </NButton>
            <NButton tertiary size="small" :disabled="!hasLogs" @click="handleClear">
              <template #icon>
                <NIcon :component="TrashOutline" />
              </template>
              清空
            </NButton>
          </div>

          <div class="flex items-center gap-2">
            <NPopconfirm
              positive-text="确认中止"
              negative-text="继续等待"
              :disabled="!commandState.active || abortingCommand"
              @positive-click="handleAbortCommand"
            >
              <template #trigger>
                <NButton
                  ghost
                  type="error"
                  size="small"
                  :disabled="!commandState.active || abortingCommand"
                  :loading="abortingCommand"
                >
                  <template #icon>
                    <NIcon :component="StopCircleOutline" />
                  </template>
                  中止
                </NButton>
              </template>
              确认中止当前 Scoop 命令？正在写入的安装步骤可能需要稍后手动清理。
            </NPopconfirm>

            <NButton
              size="small"
              :type="commandState.active ? 'default' : 'primary'"
              :disabled="commandState.active"
              @click="handleClose"
            >
              <template #icon>
                <NIcon :component="DocumentTextOutline" />
              </template>
              关闭窗口
            </NButton>
          </div>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
/* ─── 抽屉整体外壳：单一深色底，无嵌套边框 ─── */
.cmd-shell {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #0d0d10;
  color: #d4d4d8;
}

/* ─── 顶栏：任务流水线作为 Header ─── */
.pipeline-header {
  flex: 0 0 auto;
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(63, 63, 70, 0.35);
  background: linear-gradient(180deg, rgba(24, 24, 27, 0.72) 0%, rgba(13, 13, 16, 0.9) 100%);
}

.pipeline-header__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pipeline-header__title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.pipeline-header__label {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  flex: 0 0 auto;
}

.pipeline-header__arrow {
  color: #52525b;
  font-size: 12px;
  flex: 0 0 auto;
}

.pipeline-header__summary {
  font-size: 12.5px;
  color: #a1a1aa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pipeline-header__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(52, 211, 153, 0.28);
  background: rgba(16, 185, 129, 0.08);
  color: #6ee7b7;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  transition: opacity 0.24s ease;
  flex: 0 0 auto;
}

.pipeline-header__badge.is-idle {
  opacity: 0.45;
  border-color: rgba(82, 82, 91, 0.4);
  background: rgba(39, 39, 42, 0.4);
  color: #a1a1aa;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
}

.is-live .live-dot {
  animation: live-pulse 1.5s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

.is-idle .live-dot {
  background: #71717a;
  box-shadow: none;
}

/* ─── 流水线 chip 平铺 ─── */
.pipeline-chips {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 88px;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-width: thin;
  scrollbar-color: rgba(82, 82, 91, 0.35) transparent;
}
.pipeline-chips::-webkit-scrollbar {
  width: 4px;
}
.pipeline-chips::-webkit-scrollbar-thumb {
  background: rgba(82, 82, 91, 0.35);
  border-radius: 999px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 6px;
  border-radius: 999px;
  border: 1px solid rgba(63, 63, 70, 0.5);
  background: rgba(24, 24, 27, 0.65);
  font-size: 11.5px;
  line-height: 1.25;
  max-width: 100%;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}

.chip__dot {
  font-size: 9px;
  line-height: 1;
  flex: 0 0 auto;
  filter: saturate(1.1);
}

.chip__name {
  font-weight: 600;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip__status {
  opacity: 0.78;
  font-size: 10.5px;
}

.chip--running {
  border-color: rgba(56, 189, 248, 0.42);
  background: rgba(14, 165, 233, 0.14);
  color: #bae6fd;
  animation: chip-breathe 2.4s ease-in-out infinite;
}

.chip--success {
  border-color: rgba(52, 211, 153, 0.32);
  background: rgba(16, 185, 129, 0.1);
  color: #a7f3d0;
}

.chip--error {
  border-color: rgba(251, 113, 133, 0.42);
  background: rgba(244, 63, 94, 0.12);
  color: #fecaca;
}

.chip--waiting {
  color: #a1a1aa;
}

/* ─── 终端主体：100% 平铺，无外层边框/内边距容器 ─── */
.terminal {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 0 16px;
  background: #0d0d10;
  scrollbar-width: thin;
  scrollbar-color: rgba(82, 82, 91, 0.45) transparent;
}
.terminal::-webkit-scrollbar {
  width: 6px;
}
.terminal::-webkit-scrollbar-thumb {
  background: rgba(82, 82, 91, 0.5);
  border-radius: 999px;
}
.terminal::-webkit-scrollbar-track {
  background: transparent;
}

.terminal__empty {
  display: flex;
  align-items: center;
  padding: 8px 18px;
  color: #52525b;
  font-size: 12.5px;
}

.cursor {
  color: #10b981;
  animation: cursor-blink 1s steps(2) infinite;
}

.terminal__stream {
  display: block;
}

/* ─── 每行日志：block 级 + 强制换行 + 继承全局字体 ─── */
.log-line {
  /* 关键：不指定 font-family —— 沿用 body / drawerFontFamily 继承的全局字体 */
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
  padding: 2px 18px;
}

.log-line--default {
  color: #a1a1aa;
}

.log-line--active {
  color: #7dd3fc;
}

.log-line--success {
  color: #6ee7b7;
  font-weight: 500;
}

.log-line--progress {
  color: rgba(252, 211, 77, 0.85);
}

.log-line--error {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.06);
  border-left: 2px solid #ef4444;
  padding: 4px 18px 4px 16px;
  margin: 2px 0;
  font-weight: 500;
}

/* ─── 悬浮"跳至最新"按钮 ─── */
.scroll-follow {
  position: absolute;
  right: 16px;
  bottom: 14px;
  padding: 5px 12px;
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.14);
  backdrop-filter: blur(8px);
  color: #7dd3fc;
  font-size: 11.5px;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
  box-shadow: 0 6px 18px -8px rgba(14, 165, 233, 0.6);
}
.scroll-follow:hover {
  background: rgba(14, 165, 233, 0.28);
  transform: translateY(-1px);
}

/* ─── 动画 ─── */
@keyframes chip-breathe {
  0%, 100% { transform: translateY(0); box-shadow: 0 0 0 rgba(56, 189, 248, 0); }
  50% { transform: translateY(-1px); box-shadow: 0 4px 12px -8px rgba(56, 189, 248, 0.6); }
}

@keyframes live-pulse {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
  70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  50.01%, 100% { opacity: 0; }
}
</style>
