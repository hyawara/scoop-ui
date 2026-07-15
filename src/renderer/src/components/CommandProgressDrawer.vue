<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import {
  NBadge,
  NButton,
  NCollapse,
  NCollapseItem,
  NDrawer,
  NDrawerContent,
  NIcon,
  NPopconfirm,
  NSpin,
  useMessage,
} from 'naive-ui'
import {
  CheckmarkDoneOutline,
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
  latestLine?: string
  order: number
}

const MAX_LINES = 5000
const LOCAL_TERMINAL_LOG_EVENT = 'scoop-ui:terminal-log'

const message = useMessage()
const packagesStore = usePackagesStore()
const injectedFontFamily = inject<Ref<string> | string>('fontFamily', '')
const drawerFontFamily = computed(() =>
  typeof injectedFontFamily === 'string' ? injectedFontFamily : injectedFontFamily.value
)
const rawLogs = ref<string[]>([])
const commandState = ref<CommandState>({ active: false, count: 0, tasks: [] })
const abortingCommand = ref(false)

const visible = computed({
  get: () => props.show,
  set: (value) => emit('update:show', value),
})

const ansiPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g
const updateHeaderPattern = /^Updating\s+'([^']+)'\s*(?:\((.+)\))?/i
const installHeaderPattern = /^Installing\s+'([^']+)'(?:\s+\((.+)\))?/i
const uninstallHeaderPattern = /^Uninstalling\s+'?([^'\s]+)'?/i
const batchUpdatePattern = /Updating\s+\d+\s+outdated\s+apps?:\s*(.+)$/i
const successPattern = /\bwas\s+(?:installed|updated|uninstalled)\s+successfully!?\b|\bsuccessfully!?$/i
const errorPattern = /(?:^|\b)(?:ERROR:?|ERR!|ERR\b|error\b|failed\b|failure\b|fatal\b|exception\b|aborted\b|denied\b|permission\b|EPERM\b|EACCES\b|ENOENT\b|ETIMEDOUT\b|ECONNRESET\b|hash check failed|couldn'?t|cannot|can't|not found)\b/i
const downloadPattern = /\b(?:Downloading|Downloading new version|Starting download with aria2)\b/i
const extractPattern = /\bExtracting\b/i
const linkPattern = /\b(?:Linking|Unlinking)\b/i

function sanitizeLogLine(line: string): string {
  return line
    .replace(ansiPattern, '')
    .replace(/\r/g, '')
    .replace(/^ERROR RAW:\s*(?:stdout|stderr):\s*/i, '')
    .replace(/^ERROR RAW:\s*/i, '')
    .replace(/^(?:stdout|stderr):\s*/i, '')
    .replace(/^`+|`+$/g, '')
    .replace(/^\s*/, '')
    .trim()
}

const sanitizedLogs = computed(() =>
  rawLogs.value
    .map(sanitizeLogLine)
    .filter((line) => line.length > 0)
)

const hasLogs = computed(() => sanitizedLogs.value.length > 0)
const hasError = computed(() => sanitizedLogs.value.some((line) => errorPattern.test(line)))

const drawerPhase = computed<'idle' | 'running' | 'success' | 'error'>(() => {
  if (commandState.value.active) return 'running'
  if (hasError.value) return 'error'
  if (hasLogs.value) return 'success'
  return 'idle'
})

const headerText = computed(() => {
  if (drawerPhase.value === 'running') return '正在处理任务队列...'
  if (drawerPhase.value === 'success') return '任务全部完成'
  if (drawerPhase.value === 'error') return '任务执行中断 / 发生错误'
  return '等待任务'
})

const headerBadgeType = computed<'default' | 'info' | 'success' | 'error'>(() => {
  if (drawerPhase.value === 'running') return 'info'
  if (drawerPhase.value === 'success') return 'success'
  if (drawerPhase.value === 'error') return 'error'
  return 'default'
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

function taskActionLabel(task: PipelineTask): string {
  if (task.status === 'success') {
    if (task.type === 'install') return '已安装成功'
    if (task.type === 'uninstall') return '已卸载成功'
    if (task.type === 'update') return '已更新成功'
    return '已完成'
  }
  if (task.status === 'error') return '发生异常'
  if (task.status === 'running') {
    if (task.type === 'install') return '当前正在安装'
    if (task.type === 'uninstall') return '当前正在卸载'
    if (task.type === 'update') return '当前正在更新'
    return '当前正在执行'
  }
  return '等待中'
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

    const task: PipelineTask = {
      name,
      type,
      status,
      versionInfo,
      order: order++,
    }
    map.set(key, task)
    return task
  }

  for (const task of commandState.value.tasks) {
    const names = task.packages.length > 0 ? task.packages : [task.label]
    for (const name of names.filter(Boolean)) {
      ensureTask(name, task.type, commandState.value.active ? 'waiting' : 'success')
    }
  }

  for (const line of sanitizedLogs.value) {
    const batchMatch = line.match(batchUpdatePattern)
    if (batchMatch?.[1]) {
      for (const name of splitPackageList(batchMatch[1])) {
        ensureTask(name, 'update', 'waiting')
      }
      continue
    }

    const updateMatch = line.match(updateHeaderPattern)
    if (updateMatch?.[1]) {
      const task = ensureTask(updateMatch[1], 'update', 'running', updateMatch[2]?.replace(/\s*->\s*/g, ' -> '))
      task.status = 'running'
      task.latestLine = line
      activeTaskName = task.name
      continue
    }

    const installMatch = line.match(installHeaderPattern)
    if (installMatch?.[1]) {
      const task = ensureTask(installMatch[1], 'install', 'running', installMatch[2])
      task.status = 'running'
      task.latestLine = line
      activeTaskName = task.name
      continue
    }

    const uninstallMatch = line.match(uninstallHeaderPattern)
    if (uninstallMatch?.[1]) {
      const task = ensureTask(uninstallMatch[1], 'uninstall', 'running')
      task.status = 'running'
      task.latestLine = line
      activeTaskName = task.name
      continue
    }

    if (successPattern.test(line)) {
      const successApp = parseSuccessApp(line) || activeTaskName
      if (successApp) {
        const task = ensureTask(successApp)
        task.status = 'success'
        task.latestLine = line
      }
      continue
    }

    if (errorPattern.test(line) && activeTaskName) {
      const task = ensureTask(activeTaskName)
      task.status = 'error'
      task.latestLine = line
    } else if (activeTaskName) {
      ensureTask(activeTaskName).latestLine = line
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

const completedTaskCount = computed(() => pipelineTasks.value.filter((task) => task.status === 'success').length)
const failedTaskCount = computed(() => pipelineTasks.value.filter((task) => task.status === 'error').length)

const currentAction = computed(() => {
  let appName = ''
  let statusText = '准备中...'
  let detailText = ''

  for (let index = sanitizedLogs.value.length - 1; index >= 0; index--) {
    const line = sanitizedLogs.value[index]

    if (!detailText && (line.includes('aria2') || downloadPattern.test(line))) {
      detailText = line
    }

    const updateMatch = line.match(updateHeaderPattern)
    if (updateMatch?.[1]) {
      appName = updateMatch[1]
      if (statusText === '准备中...') statusText = '正在更新...'
      break
    }

    const installMatch = line.match(installHeaderPattern)
    if (installMatch?.[1]) {
      appName = installMatch[1]
      if (statusText === '准备中...') statusText = '正在安装...'
      break
    }

    if (line.includes('Downloading new version')) {
      statusText = '正在下载新版本...'
      continue
    }
    if (line.includes('Starting download with aria2')) {
      statusText = '正在通过 aria2 高速下载...'
      continue
    }
    if (extractPattern.test(line)) {
      statusText = '正在解压安装包...'
      continue
    }
    if (linkPattern.test(line)) {
      statusText = '正在创建系统软链接...'
      continue
    }
    if (successPattern.test(line)) {
      statusText = '正在收尾并校验结果...'
      continue
    }
    if (errorPattern.test(line)) {
      statusText = '任务执行出现异常'
      detailText = line
      continue
    }
  }

  const runningTask = pipelineTasks.value.find((task) => task.status === 'running')
  if (!appName && runningTask) appName = runningTask.name
  if (!detailText && runningTask?.latestLine) detailText = runningTask.latestLine

  if (drawerPhase.value === 'success') {
    statusText = '任务全部完成'
    detailText = `${completedTaskCount.value || pipelineTasks.value.length || 1} 个任务已完成`
  } else if (drawerPhase.value === 'idle') {
    statusText = '等待 Scoop 输出'
    detailText = '开始安装或更新后，这里会展示当前动作'
  }

  return { appName, statusText, detailText }
})

function logLineKind(line: string): 'error' | 'active' | 'success' | 'normal' {
  if (errorPattern.test(line)) return 'error'
  if (successPattern.test(line)) return 'success'
  if (downloadPattern.test(line) || extractPattern.test(line) || linkPattern.test(line)) return 'active'
  return 'normal'
}

function appendRawChunk(chunk: string) {
  if (!chunk) return
  const normalized = chunk.replace(/\r\n/g, '\n')
  const next = [...rawLogs.value]

  if (normalized.includes('\r') && !normalized.includes('\n')) {
    const latest = normalized.slice(normalized.lastIndexOf('\r') + 1)
    if (next.length === 0) next.push(latest)
    else next[next.length - 1] = latest
    rawLogs.value = next.slice(-MAX_LINES)
    return
  }

  let current = next.pop() ?? ''
  for (const char of normalized) {
    if (char === '\r') {
      current = ''
      continue
    }
    if (char === '\n') {
      next.push(current)
      current = ''
      continue
    }
    current += char
  }
  next.push(current)
  rawLogs.value = next.slice(-MAX_LINES)
}

function handleClear() {
  rawLogs.value = []
  message.info('日志已清空')
}

function handleExport() {
  const content = sanitizedLogs.value.join('\n')
  const blob = new Blob([
    `=== Scoop UI 执行日志 ===\n导出时间: ${new Date().toLocaleString()}\n\n${content}`,
  ], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `scoop-task-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`
  link.click()
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
  >
    <NDrawerContent
      :native-scrollbar="false"
      body-content-style="padding:0;display:flex;flex-direction:column;height:100%;overflow:hidden"
    >
      <template #header>
        <div class="flex items-center justify-between w-full pr-1">
          <div class="flex items-center gap-3 min-w-0">
            <NBadge dot :processing="drawerPhase === 'running'" :type="headerBadgeType" />
            <div class="min-w-0">
              <div class="text-sm font-semibold text-zinc-100 tracking-tight">{{ headerText }}</div>
              <div class="text-[11px] text-zinc-500 font-mono">
                {{ pipelineTasks.length }} tasks / {{ sanitizedLogs.length }} logs
              </div>
            </div>
          </div>
          <div
            class="hidden sm:flex items-center gap-2 rounded-md border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-1 text-[11px] font-medium text-amber-200/80"
          >
            Task Pipeline
          </div>
        </div>
      </template>

      <div
        class="command-drawer-shell flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#10100e] text-zinc-200"
        :style="{ fontFamily: drawerFontFamily }"
      >
        <div class="p-4 space-y-4">
          <section class="current-action-card">
            <div class="flex items-start gap-4">
              <div class="spin-orbit">
                <NSpin v-if="drawerPhase === 'running'" size="medium" />
                <NIcon
                  v-else-if="drawerPhase === 'success'"
                  :component="CheckmarkDoneOutline"
                  size="24"
                  class="text-emerald-300"
                />
                <NIcon
                  v-else-if="drawerPhase === 'error'"
                  :component="StopCircleOutline"
                  size="24"
                  class="text-rose-300"
                />
                <span v-else class="idle-dot" />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-[11px] uppercase tracking-[0.18em] text-amber-200/60">Current Action</span>
                  <span v-if="currentAction.appName" class="action-chip">{{ currentAction.appName }}</span>
                </div>
                <div class="text-[20px] leading-tight font-semibold text-zinc-50 tracking-tight">
                  {{ currentAction.statusText }}
                </div>
                <div class="mt-3 h-6 overflow-hidden rounded-md border border-white/[0.06] bg-zinc-950/55">
                  <div class="log-crawl px-3 py-1 text-[12px] font-mono text-zinc-400 whitespace-nowrap">
                    {{ currentAction.detailText || '等待下一条关键日志...' }}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="pipeline-panel">
            <div class="flex items-center justify-between gap-3 px-1">
              <div>
                <h3 class="text-sm font-semibold text-zinc-100">任务流水线</h3>
                <p class="text-[12px] text-zinc-500 mt-0.5">
                  {{ completedTaskCount }} 完成 / {{ failedTaskCount }} 异常 / {{ pipelineTasks.length }} 总计
                </p>
              </div>
            </div>

            <div v-if="pipelineTasks.length === 0" class="pipeline-empty">
              <NIcon :component="DocumentTextOutline" size="22" />
              <span>等待 Scoop 任务进入队列</span>
            </div>

            <div v-else class="mt-3 space-y-2">
              <div
                v-for="task in pipelineTasks"
                :key="`${task.type}:${task.name}`"
                class="pipeline-item"
                :class="`pipeline-item--${task.status}`"
              >
                <div class="pipeline-icon">
                  <NSpin v-if="task.status === 'running'" size="small" />
                  <NIcon
                    v-else-if="task.status === 'success'"
                    :component="CheckmarkDoneOutline"
                    size="18"
                  />
                  <NIcon
                    v-else-if="task.status === 'error'"
                    :component="StopCircleOutline"
                    size="18"
                  />
                  <span v-else class="waiting-ring" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="truncate text-sm font-semibold">{{ task.name }}</span>
                    <span v-if="task.versionInfo" class="version-pill">{{ task.versionInfo }}</span>
                  </div>
                  <div class="mt-0.5 truncate text-[12px] opacity-75">
                    {{ taskActionLabel(task) }}
                    <template v-if="task.latestLine"> · {{ task.latestLine }}</template>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <NCollapse arrow-placement="right" display-directive="show" class="raw-log-collapse">
            <NCollapseItem name="raw">
              <template #header>
                <div class="flex items-center gap-2">
                  <NIcon :component="DocumentTextOutline" size="15" />
                  <span class="text-sm font-medium">高级日志</span>
                  <span class="text-[11px] text-zinc-500 font-mono">{{ sanitizedLogs.length }} lines</span>
                </div>
              </template>

              <div v-if="sanitizedLogs.length === 0" class="raw-log-empty">
                还没有可展示的日志。
              </div>
              <div v-else class="raw-log-box">
                <div
                  v-for="(line, index) in sanitizedLogs"
                  :key="`${index}:${line}`"
                  class="raw-log-line"
                  :class="`raw-log-line--${logLineKind(line)}`"
                >
                  {{ line }}
                </div>
              </div>
            </NCollapseItem>
          </NCollapse>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3 w-full">
          <div class="flex items-center gap-2">
            <NButton tertiary size="small" :disabled="!hasLogs" @click="handleExport">
              <template #icon>
                <NIcon :component="DownloadOutline" />
              </template>
              导出日志
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
              关闭窗口
            </NButton>
          </div>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.command-drawer-shell {
  scrollbar-width: thin;
  scrollbar-color: rgba(161, 161, 170, 0.36) transparent;
}

.command-drawer-shell::-webkit-scrollbar {
  width: 6px;
}

.command-drawer-shell::-webkit-scrollbar-track {
  background: transparent;
}

.command-drawer-shell::-webkit-scrollbar-thumb {
  background: rgba(161, 161, 170, 0.3);
  border-radius: 999px;
}

.current-action-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(251, 191, 36, 0.16);
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(24, 24, 27, 0.78) 42%),
    rgba(24, 24, 27, 0.82);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 48px -30px rgba(251, 191, 36, 0.45);
  padding: 18px;
}

.current-action-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.04), transparent);
  transform: translateX(-100%);
  animation: action-sheen 4.2s cubic-bezier(0.16, 1, 0.3, 1) infinite;
}

.spin-orbit {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 999px;
  border: 1px solid rgba(251, 191, 36, 0.18);
  background: rgba(250, 204, 21, 0.06);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.idle-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #71717a;
}

.action-chip,
.version-pill {
  min-width: 0;
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(251, 191, 36, 0.18);
  border-radius: 6px;
  background: rgba(251, 191, 36, 0.08);
  padding: 2px 7px;
  color: rgba(253, 230, 138, 0.9);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
}

.log-crawl {
  animation: log-crawl 14s linear infinite;
}

.pipeline-panel {
  border: 1px solid rgba(113, 113, 122, 0.18);
  border-radius: 12px;
  background: rgba(24, 24, 27, 0.58);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  padding: 14px;
}

.pipeline-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  border: 1px dashed rgba(161, 161, 170, 0.22);
  border-radius: 10px;
  padding: 18px;
  color: #71717a;
  font-size: 13px;
}

.pipeline-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  border: 1px solid rgba(113, 113, 122, 0.18);
  border-radius: 10px;
  padding: 10px 12px;
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.24s ease, background 0.24s ease;
}

.pipeline-item--running {
  border-color: rgba(56, 189, 248, 0.34);
  background: rgba(14, 165, 233, 0.1);
  color: #e0f2fe;
  animation: breathing-card 2.8s ease-in-out infinite;
}

.pipeline-item--success {
  border-color: rgba(52, 211, 153, 0.22);
  background: rgba(16, 185, 129, 0.08);
  color: #d1fae5;
}

.pipeline-item--error {
  border-color: rgba(251, 113, 133, 0.34);
  background: rgba(244, 63, 94, 0.1);
  color: #ffe4e6;
}

.pipeline-item--waiting {
  color: #a1a1aa;
  background: rgba(39, 39, 42, 0.36);
}

.pipeline-icon {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
}

.waiting-ring {
  width: 10px;
  height: 10px;
  border: 1px solid rgba(161, 161, 170, 0.75);
  border-radius: 999px;
}

.raw-log-collapse {
  border: 1px solid rgba(113, 113, 122, 0.18);
  border-radius: 12px;
  background: rgba(24, 24, 27, 0.5);
  padding: 0 12px;
}

.raw-log-empty {
  padding: 22px 4px 26px;
  color: #71717a;
  font-size: 13px;
}

.raw-log-box {
  max-height: 360px;
  overflow: auto;
  padding: 8px 2px 14px;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.55;
}

.raw-log-line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-radius: 6px;
  padding: 2px 4px;
  color: #71717a;
}

.raw-log-line--error {
  margin: 4px 0;
  border-left: 2px solid #f43f5e;
  background: rgba(244, 63, 94, 0.1);
  color: #fb7185;
  padding: 4px 8px;
}

.raw-log-line--active {
  color: #60a5fa;
  font-weight: 600;
}

.raw-log-line--success {
  color: #34d399;
  background: rgba(16, 185, 129, 0.06);
}

@keyframes action-sheen {
  0% {
    transform: translateX(-100%);
  }
  46%,
  100% {
    transform: translateX(100%);
  }
}

@keyframes breathing-card {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-1px);
  }
}

@keyframes log-crawl {
  0%,
  18% {
    transform: translateX(0);
  }
  82%,
  100% {
    transform: translateX(-18%);
  }
}
</style>
