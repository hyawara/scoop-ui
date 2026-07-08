<script setup lang="ts">
import { ref, computed, watch, watchEffect, nextTick, onMounted, inject } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NSelect,
  useMessage,
} from 'naive-ui'
import type { PackagePhase } from '@/composables/usePackageProgress'
import { usePackageProgress } from '@/composables/usePackageProgress'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const message = useMessage()
const { progressMap } = usePackageProgress()
const fontFamily = inject<string>('fontFamily', '')
const scrollContainer = ref<HTMLElement | null>(null)

type TaskStatus = 'pending' | 'running' | 'success' | 'error'

interface TaskLog {
  id: string
  status: TaskStatus
  logs: string[]
  caveats?: string[]
  caveatsExecuted?: boolean
}

interface EmbeddedExecution {
  taskId: string
  command: string
  logs: Array<{ type: 'stdout' | 'stderr'; content: string }>
  status: 'running' | 'completed' | 'failed'
}

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

const capturedNames = new Set<string>()
const taskStream = ref<TaskLog[]>([])

function phaseToStatus(phase: PackagePhase): TaskStatus {
  switch (phase) {
    case 'queued': return 'pending'
    case 'downloading':
    case 'installing': return 'running'
    case 'success': return 'success'
    case 'error': return 'error'
  }
}

function ensureTask(name: string, progress: { phase: PackagePhase; logs: string[] }) {
  if (capturedNames.has(name)) return
  capturedNames.add(name)
  taskStream.value.push({
    id: name,
    status: phaseToStatus(progress.phase),
    logs: [...progress.logs],
  })
}

function syncTask(name: string, progress: { phase: PackagePhase; logs: string[] }) {
  const task = taskStream.value.find((t) => t.id === name)
  if (!task) return
  task.status = phaseToStatus(progress.phase)
  if (progress.logs.length > task.logs.length) {
    task.logs.push(...progress.logs.slice(task.logs.length))
  }
}

let lastSyncTick = 0
const syncSkipCount = 2

function safeSync() {
  lastSyncTick++
  if (lastSyncTick % syncSkipCount !== 0) return
  for (const [name, p] of progressMap) {
    ensureTask(name, p)
    syncTask(name, p)
  }
}

watchEffect(() => {
  for (const [name] of progressMap) void name
  void progressMap.size
  safeSync()
})

watchEffect(() => {
  for (const [, p] of progressMap) void p.phase
  safeSync()
})

watchEffect(() => {
  for (const [, p] of progressMap) void p.logs.length
  safeSync()
})

const taskCount = computed(() => taskStream.value.length)
const completedCount = computed(() => taskStream.value.filter((t) => t.status === 'success').length)
const runningCount = computed(() => taskStream.value.filter((t) => t.status === 'running' || t.status === 'pending').length)

const batchProgressText = computed(() => {
  if (taskCount.value === 0) return ''
  if (taskCount.value === 1) {
    const task = taskStream.value[0]
    return task.status === 'running' ? '执行中...' : task.status === 'success' ? '已完成' : task.status === 'error' ? '执行失败' : '等待中'
  }
  if (runningCount.value > 0) return `执行中 (${completedCount.value}/${taskCount.value})`
  return `全部完成 (${completedCount.value}/${taskCount.value})`
})

const jumpValue = ref<string | null>(null)
const jumpOptions = computed(() =>
  taskStream.value.map((t) => {
    const icon = t.status === 'success' ? '🟢' : t.status === 'error' ? '🔴' : t.status === 'running' ? '🟡' : '⚪'
    return {
      label: `${icon} ${t.id}`,
      value: t.id,
    }
  })
)

function jumpToTask(pkgName: string) {
  const el = document.getElementById(`task-block-${pkgName}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  jumpValue.value = null
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
}

function statusColor(status: TaskStatus) {
  switch (status) {
    case 'success': return { bg: 'bg-emerald-500/15', text: 'text-emerald-500', label: '成功' }
    case 'error': return { bg: 'bg-red-500/15', text: 'text-red-500', label: '失败' }
    case 'running': return { bg: 'bg-amber-500/15', text: 'text-amber-500', label: '执行中' }
    default: return { bg: 'bg-zinc-500/10', text: 'text-zinc-500', label: '等待中' }
  }
}

function getLogLineClass(log: string): string {
  if (log.includes('ERROR') || log.includes('[error]')) return 'terminal-error'
  if (log.includes('WARN') || log.includes('[warn]')) return 'terminal-warn'
  if (log.includes('SUCCESS') || log.includes('done') || log.includes('installed')) return 'terminal-success'
  return 'terminal-info'
}

const POST_ACTION_PATTERNS = [
  /Please run\s+(.+)/i,
  /To configure\s+(.+)/i,
  /run\s+'(.+)'/i,
  /Notes:\s*(.+)/i,
  /You may need to run\s+(.+)/i,
  /After installation\s+(.+)/i,
  /Setup complete\.?\s*(.+)/i,
  /You should run\s+(.+)/i,
  /Don't forget to run\s+(.+)/i,
]

function extractCaveats(task: TaskLog) {
  if (task.caveats || task.caveatsExecuted) return
  const commands: string[] = []
  for (const line of task.logs) {
    for (const pattern of POST_ACTION_PATTERNS) {
      const match = line.match(pattern)
      if (match && match[1]) {
        const cmd = match[1].trim()
        if (cmd.length < 200 && !cmd.includes('http') && !cmd.includes('://')) {
          commands.push(cmd)
        }
      }
    }
  }
  const unique = [...new Set(commands)]
  if (unique.length > 0) {
    task.caveats = unique
  }
}

watch(
  () => taskStream.value.filter((t) => t.status === 'success' || t.status === 'error').map((t) => t.id),
  () => {
    for (const task of taskStream.value) {
      if (task.status === 'success' || task.status === 'error') {
        extractCaveats(task)
      }
    }
  },
  { deep: true }
)

const embeddedExecutions = ref<EmbeddedExecution[]>([])
const runningExecMap = new Map<string, EmbeddedExecution>()

async function copyCommand(cmd: string) {
  try {
    await navigator.clipboard.writeText(cmd)
    message.success('命令已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

async function executeCaveat(task: TaskLog, cmd: string) {
  if (!window.scoopAPI?.executeCommand) {
    message.error('内嵌执行功能不可用')
    return
  }
  const execution: EmbeddedExecution = {
    taskId: task.id,
    command: cmd,
    logs: [],
    status: 'running',
  }
  embeddedExecutions.value.push(execution)
  runningExecMap.set(cmd, execution)
  await nextTick()
  scrollToBottom()
  try {
    await window.scoopAPI.executeCommand(cmd)
    execution.status = 'completed'
    runningExecMap.delete(cmd)
    message.success('命令执行完成')
  } catch (error: any) {
    execution.status = 'failed'
    runningExecMap.delete(cmd)
    message.error('命令执行失败')
  }
  await nextTick()
  scrollToBottom()
}

function setupExecuteLogListener() {
  if (window.scoopAPI?.onExecuteCommandLog) {
    window.scoopAPI.onExecuteCommandLog((data: { command: string; type: 'stdout' | 'stderr'; content: string }) => {
      const exec = runningExecMap.get(data.command)
      if (exec) {
        exec.logs.push({ type: data.type, content: data.content })
        nextTick(() => scrollToBottom())
      }
    })
  }
}

function handleExportLogs() {
  const lines: string[] = [
    `=== Scoop UI 批量执行日志 ===`,
    `导出时间: ${new Date().toLocaleString()}`,
    `任务总数: ${taskCount.value} | 成功: ${completedCount.value}`,
    '',
  ]
  for (const task of taskStream.value) {
    const s = statusColor(task.status)
    const separator = '─'.repeat(60)
    lines.push(`[${s.label}] ${task.id} ${separator}`)
    lines.push('')
    for (const log of task.logs) {
      lines.push(`  ${log}`)
    }
    if (task.caveats && task.caveats.length > 0) {
      lines.push('')
      lines.push('  ⚠ 后置命令建议:')
      for (const cmd of task.caveats) {
        lines.push(`    > ${cmd}`)
      }
    }
    const relatedExecs = embeddedExecutions.value.filter((e) => e.taskId === task.id)
    if (relatedExecs.length > 0) {
      lines.push('')
      lines.push('  ── 内嵌执行记录 ──')
      for (const exec of relatedExecs) {
        lines.push(`    # ${exec.command} (${exec.status})`)
        for (const l of exec.logs) {
          lines.push(`      ${l.content}`)
        }
      }
    }
    lines.push('')
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.download = `scoop-batch-log-${dateStr}.txt`
  a.click()
  URL.revokeObjectURL(url)
  message.success('日志已导出')
}

function handleClearStream() {
  taskStream.value = []
  embeddedExecutions.value = []
  capturedNames.clear()
  runningExecMap.clear()
  message.info('日志流已清空')
}

function handleClose() {
  visible.value = false
}

onMounted(() => setupExecuteLogListener())

const hasRunning = computed(() => runningCount.value > 0)
</script>

<template>
  <NDrawer
    v-model:show="visible"
    :width="720"
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
            <div
              class="w-2.5 h-2.5 rounded-full flex-shrink-0"
              :class="{
                'bg-green-500': !hasRunning && taskCount > 0,
                'bg-amber-500 animate-pulse': hasRunning,
                'bg-zinc-400 dark:bg-zinc-600': taskCount === 0,
              }"
            />
            <span class="font-mono text-sm font-semibold">终端日志流</span>
            <span v-if="batchProgressText" class="text-xs opacity-60 font-mono tabular-nums">
              {{ batchProgressText }}
            </span>
          </div>
        </div>
      </template>

      <div
        v-if="taskCount > 1"
        class="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
        style="border-color: var(--n-border-color); background: var(--n-color-embedded)"
      >
        <span class="text-xs opacity-60 font-mono">
          {{ batchProgressText }}
        </span>
        <NSelect
          v-model:value="jumpValue"
          :options="jumpOptions"
          placeholder="快速跳转至..."
          size="tiny"
          class="w-48"
          @update:value="(val: string) => jumpToTask(val)"
        />
      </div>

      <div
        ref="scrollContainer"
        class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 terminal-scroll"
      >
        <div class="terminal-viewport flex flex-col justify-start items-stretch min-h-full" :style="{ fontFamily }">
          <div v-if="taskStream.length === 0" class="flex-1 flex items-start justify-center pt-24">
            <p class="terminal-dim font-mono text-sm">等待任务输入...</p>
          </div>

          <template v-for="(task, tIdx) in taskStream" :key="task.id">
            <div
              :id="`task-block-${task.id}`"
              :class="statusColor(task.status).bg"
              class="flex items-center gap-2 px-4 py-1.5 border-b border-[#27272a]"
            >
              <span
                :class="statusColor(task.status).text"
                class="text-xs font-mono font-semibold tracking-wide"
              >
                {{ statusColor(task.status).label }} &middot; {{ task.id }}
              </span>
              <span class="flex-1 border-b border-dashed border-zinc-700/50 mx-1" />
              <span class="text-[11px] font-mono text-zinc-500">
                {{ task.logs.length }} 行
              </span>
            </div>

            <div class="terminal-body">
              <template v-if="task.logs.length === 0 && task.status === 'pending'">
                <p class="terminal-dim text-sm pl-4 py-3 italic">排队等待调度...</p>
              </template>
              <div
                v-for="(line, lIdx) in task.logs"
                :key="lIdx"
                class="terminal-line"
              >
                <span class="line-number">{{ String(lIdx + 1).padStart(4, '0') }}</span>
                <span :class="getLogLineClass(line)" class="break-all">{{ line }}</span>
              </div>

              <div
                v-if="task.caveats && task.caveats.length > 0"
                class="caveats-card mt-4 mx-3"
              >
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-amber-400 text-sm font-mono">&#9888;</span>
                  <span class="text-amber-400 text-xs font-semibold font-mono">后置配置建议</span>
                </div>
                <div
                  v-for="(cmd, cIdx) in task.caveats"
                  :key="cIdx"
                  class="caveat-row"
                >
                  <code class="caveat-command">{{ cmd }}</code>
                  <div class="caveat-actions">
                    <NButton size="tiny" quaternary @click="copyCommand(cmd)">复制</NButton>
                    <NButton size="tiny" type="primary" @click="executeCaveat(task, cmd)">&#128640; 执行</NButton>
                  </div>
                </div>
              </div>

              <span
                v-if="task.status === 'running'"
                class="terminal-cursor"
              />
            </div>

            <template v-for="exec in embeddedExecutions.filter(e => e.taskId === task.id)" :key="'exec-' + exec.command">
              <div class="embedded-block">
                <div class="embedded-cmd">
                  <span class="text-cyan-400 font-mono text-xs">&#8250; 内嵌执行:</span>
                  <code class="text-zinc-200 ml-2 text-xs font-mono">{{ exec.command }}</code>
                </div>
                <div v-for="(l, ei) in exec.logs" :key="ei" class="embedded-line">
                  <span :class="l.type === 'stderr' ? 'terminal-error' : 'terminal-default'" class="font-mono text-xs">{{ l.content }}</span>
                </div>
                <div class="embedded-status">
                  <span v-if="exec.status === 'running'" class="text-cyan-400 text-xs font-mono">&#9679; 执行中...</span>
                  <span v-else-if="exec.status === 'completed'" class="terminal-success font-mono text-xs">&#10003; 完成</span>
                  <span v-else class="terminal-error text-xs font-mono">&#10007; 失败</span>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <NButton @click="handleClearStream" quaternary size="small">清空流</NButton>
            <NButton @click="handleExportLogs" quaternary size="small" :disabled="taskStream.length === 0">导出日志</NButton>
          </div>
          <NButton @click="handleClose" type="primary">关闭窗口</NButton>
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

.terminal-viewport {
  background: #09090b;
  color: #d4d4d8;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
}

.terminal-body {
  padding: 6px 14px 12px;
}

.terminal-line {
  display: flex;
  gap: 10px;
  border-radius: 3px;
}

.terminal-line:hover {
  background: rgba(255, 255, 255, 0.025);
}

.line-number {
  color: #3f3f46;
  user-select: none;
  min-width: 38px;
  text-align: right;
  flex-shrink: 0;
  font-size: 11px;
}

.terminal-info { color: #a3e635; }
.terminal-success { color: #34d399; }
.terminal-warn { color: #fbbf24; }
.terminal-error { color: #f87171; }
.terminal-dim { color: #52525b; }
.terminal-default { color: #a1a1aa; }

.terminal-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: rgba(52, 211, 153, 0.7);
  margin-left: 4px;
  animation: blink 1s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  50% { opacity: 0; }
}

.caveats-card {
  border: 1px solid rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.08);
  border-radius: 8px;
  padding: 14px 16px;
}

.caveat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.05);
  margin-top: 8px;
}

.caveat-row:first-child {
  margin-top: 0;
}

.caveat-command {
  color: #fbbf24;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 8px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.caveat-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.embedded-block {
  margin: 4px 16px 12px;
  border-left: 2px solid rgba(34, 211, 238, 0.4);
  padding: 10px 14px;
  background: rgba(34, 211, 238, 0.04);
  border-radius: 0 6px 6px 0;
}

.embedded-cmd {
  margin-bottom: 6px;
}

.embedded-line {
  padding: 1px 0;
  opacity: 0.85;
}

.embedded-status {
  margin-top: 6px;
}
</style>
