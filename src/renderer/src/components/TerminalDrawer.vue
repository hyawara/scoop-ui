<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NTag,
  NScrollbar,
  useMessage,
} from 'naive-ui'
import type { PackageProgress } from '@/composables/usePackageProgress'

interface PostAction {
  command: string
  executing?: boolean
  status?: 'pending' | 'completed' | 'failed'
}

interface EmbeddedExecution {
  command: string
  logs: Array<{ type: 'stdout' | 'stderr'; content: string }>
  status: 'running' | 'completed' | 'failed'
}

const props = defineProps<{
  show: boolean
  progress: PackageProgress | null
  packageName: string
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()

const message = useMessage()
const scrollRef = ref<InstanceType<typeof NScrollbar> | null>(null)

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val),
})

// 日志数据
const logs = computed(() => props.progress?.logs || [])
const postActions = ref<PostAction[]>([])
const embeddedExecutions = ref<EmbeddedExecution[]>([])

// 状态计算
const statusText = computed(() => {
  if (props.progress?.phase === 'success') return '已完成'
  if (props.progress?.phase === 'error') return '执行失败'
  if (props.progress?.phase === 'downloading' || props.progress?.phase === 'installing') return '执行中...'
  if (props.progress?.phase === 'queued') return '排队中'
  return '等待中'
})

const statusTagType = computed(() => {
  if (props.progress?.phase === 'success') return 'success' as const
  if (props.progress?.phase === 'error') return 'error' as const
  if (props.progress?.phase === 'downloading' || props.progress?.phase === 'installing') return 'warning' as const
  return 'default' as const
})

const isActive = computed(() =>
  props.progress?.phase === 'downloading' ||
  props.progress?.phase === 'installing' ||
  props.progress?.phase === 'queued'
)

// 后置命令正则匹配模式
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

// 监听日志变化，提取后置命令
watch(
  () => logs.value,
  (newLogs) => {
    if (props.progress?.phase === 'success' || props.progress?.phase === 'error') {
      extractPostActions(newLogs)
    }
  },
  { deep: true }
)

// 监听执行完成，自动滚动
watch(
  () => logs.value.length,
  () => {
    nextTick(() => scrollToBottom())
  }
)

function extractPostActions(logLines: string[]) {
  const commands: PostAction[] = []

  for (const line of logLines) {
    for (const pattern of POST_ACTION_PATTERNS) {
      const match = line.match(pattern)
      if (match && match[1]) {
        const cmd = match[1].trim()
        // 过滤掉过长或明显不是命令的内容
        if (cmd.length < 200 && !cmd.includes('http') && !cmd.includes('://')) {
          commands.push({ command: cmd, status: 'pending' })
        }
      }
    }
  }

  // 去重
  const unique = commands.filter(
    (item, index, self) =>
      self.findIndex((c) => c.command === item.command) === index
  )

  postActions.value = unique
}

function getLogLineClass(log: string): string {
  if (log.includes('ERROR') || log.includes('error')) return 'text-red-400'
  if (log.includes('WARN') || log.includes('warn')) return 'text-amber-400'
  if (log.includes('SUCCESS') || log.includes('done') || log.includes('installed')) return 'text-green-400'
  return 'text-emerald-400'
}

async function copyCommand(cmd: string) {
  try {
    await navigator.clipboard.writeText(cmd)
    message.success('命令已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

async function executeCommand(action: PostAction) {
  if (!window.scoopAPI?.executeCommand) {
    message.error('内嵌执行功能不可用')
    return
  }

  action.executing = true

  // 创建内嵌执行记录
  const execution: EmbeddedExecution = {
    command: action.command,
    logs: [],
    status: 'running',
  }
  embeddedExecutions.value.push(execution)

  // 自动滚动到底部
  await nextTick()
  scrollToBottom()

  try {
    await window.scoopAPI.executeCommand(action.command)

    execution.status = 'completed'
    action.status = 'completed'
    action.executing = false

    message.success('命令执行完成')
  } catch (error: any) {
    execution.status = 'failed'
    action.status = 'failed'
    action.executing = false

    // 添加错误日志
    execution.logs.push({
      type: 'stderr',
      content: error?.message || '命令执行失败',
    })

    message.error('命令执行失败')
  }

  await nextTick()
  scrollToBottom()
}

function scrollToBottom() {
  if (scrollRef.value) {
    scrollRef.value.scrollTo({ top: 999999, behavior: 'smooth' })
  }
}

function handleClearLogs() {
  postActions.value = []
  embeddedExecutions.value = []
  message.info('日志已清空')
}

function handleExportLogs() {
  const allLogs = [
    `=== ${props.packageName} 执行日志 ===`,
    `时间: ${new Date().toLocaleString()}`,
    `状态: ${statusText.value}`,
    '',
    '--- 主日志 ---',
    ...logs.value,
    '',
    '--- 后置命令执行记录 ---',
    ...embeddedExecutions.value.flatMap((exec) => [
      `$ ${exec.command}`,
      ...exec.logs.map((l) => l.content),
      `状态: ${exec.status === 'completed' ? '成功' : exec.status === 'failed' ? '失败' : '执行中'}`,
      '',
    ]),
  ]

  const blob = new Blob([allLogs.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.packageName}-execution-log.txt`
  a.click()
  URL.revokeObjectURL(url)
  message.success('日志已导出')
}

function handleClose() {
  visible.value = false
}

// 监听内嵌执行日志
function setupExecuteLogListener() {
  if (window.scoopAPI?.onExecuteCommandLog) {
    window.scoopAPI.onExecuteCommandLog((data: { command: string; type: 'stdout' | 'stderr'; content: string }) => {
      const execution = embeddedExecutions.value.find(
        (e) => e.command === data.command && e.status === 'running'
      )
      if (execution) {
        execution.logs.push({ type: data.type, content: data.content })
        nextTick(() => scrollToBottom())
      }
    })
  }
}

// 组件挂载时设置监听器
watch(
  () => visible.value,
  (val) => {
    if (val) {
      setupExecuteLogListener()
      nextTick(() => scrollToBottom())
    }
  }
)
</script>

<template>
  <NDrawer
    v-model:show="visible"
    :width="680"
    placement="right"
    :mask-closable="true"
    :close-on-esc="true"
  >
    <NDrawerContent :native-scrollbar="false" body-content-style="padding: 0; display: flex; flex-direction: column; height: 100%;">
      <!-- 顶部状态栏 -->
      <template #header>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div
              class="w-2 h-2 rounded-full"
              :class="{
                'bg-green-500': progress?.phase === 'success',
                'bg-red-500': progress?.phase === 'error',
                'bg-amber-500 animate-pulse': isActive,
                'bg-zinc-500': !isActive && progress?.phase !== 'success' && progress?.phase !== 'error',
              }"
            />
            <span class="font-mono text-sm font-medium">{{ packageName }}</span>
          </div>
          <NTag :type="statusTagType" size="small" round>
            {{ statusText }}
          </NTag>
          <span class="text-xs text-zinc-500">共 {{ logs.length }} 行输出</span>
        </div>
      </template>

      <!-- 终端日志视口 -->
      <div class="flex-1 flex flex-col min-h-0">
        <NScrollbar ref="scrollRef" class="flex-1">
          <div class="terminal-viewport">
            <!-- 主日志区域 -->
            <div class="terminal-header">
              <span class="text-zinc-400 text-xs font-mono">$ scoop {{ packageName }}</span>
            </div>
            <div class="terminal-body">
              <div v-if="logs.length === 0" class="text-zinc-600 text-center py-8">
                暂无日志输出
              </div>
              <div
                v-for="(line, index) in logs"
                :key="index"
                class="terminal-line"
              >
                <span class="line-number">{{ String(index + 1).padStart(3, '0') }}</span>
                <span :class="getLogLineClass(line)">{{ line }}</span>
              </div>

              <!-- 内嵌执行日志追加区 -->
              <div
                v-for="(exec, index) in embeddedExecutions"
                :key="'exec-' + index"
                class="embedded-execution-block"
              >
                <div class="exec-command-line">
                  <span class="text-cyan-400">> [内嵌执行]</span>
                  <span class="text-zinc-100 ml-2">{{ exec.command }}</span>
                </div>
                <div
                  v-for="(line, i) in exec.logs"
                  :key="i"
                  class="exec-output-line"
                >
                  <span :class="line.type === 'stderr' ? 'text-red-400' : 'text-zinc-300'">{{ line.content }}</span>
                </div>
                <div v-if="exec.status === 'completed'" class="exec-status-success">
                  <span class="text-green-400">✓ 执行完成</span>
                </div>
                <div v-else-if="exec.status === 'failed'" class="exec-status-failed">
                  <span class="text-red-400">✗ 执行失败</span>
                </div>
                <div v-else class="exec-status-running">
                  <span class="text-cyan-400 animate-pulse">● 执行中...</span>
                </div>
              </div>

              <!-- 执行中光标 -->
              <span v-if="isActive" class="inline-block w-2 h-4 bg-emerald-400/70 animate-pulse ml-1" />
            </div>
          </div>
        </NScrollbar>

        <!-- 后置命令建议卡片 -->
        <div v-if="postActions.length > 0" class="post-actions-panel">
          <div class="post-actions-header">
            <span class="text-amber-400 text-lg">💡</span>
            <span class="font-medium text-amber-300 text-sm">后置配置建议 (Post-Actions)</span>
          </div>
          <div class="post-actions-list">
            <div
              v-for="(action, index) in postActions"
              :key="index"
              class="post-action-item"
            >
              <div class="action-content">
                <code class="action-command">{{ action.command }}</code>
              </div>
              <div class="action-buttons">
                <NButton
                  size="tiny"
                  quaternary
                  @click="copyCommand(action.command)"
                >
                  📋 复制
                </NButton>
                <NButton
                  size="tiny"
                  type="primary"
                  :loading="action.executing"
                  :disabled="action.status === 'completed'"
                  @click="executeCommand(action)"
                >
                  {{ action.status === 'completed' ? '✓ 已完成' : '🚀 执行' }}
                </NButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <template #footer>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2">
            <NButton @click="handleClearLogs" quaternary size="small">
              清空日志
            </NButton>
            <NButton @click="handleExportLogs" quaternary size="small">
              导出日志
            </NButton>
          </div>
          <NButton @click="handleClose" type="primary">
            关闭窗口
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.terminal-viewport {
  background: #090a0d;
  color: #d4d4d8;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 13px;
  line-height: 1.75;
  min-height: 400px;
}

.terminal-header {
  padding: 8px 16px;
  border-bottom: 1px solid #27272a;
  color: #a1a1aa;
  position: sticky;
  top: 0;
  background: #090a0d;
  z-index: 10;
}

.terminal-body {
  padding: 16px;
}

.terminal-line {
  display: flex;
  gap: 12px;
  border-radius: 4px;
}

.terminal-line:hover {
  background: rgba(24, 24, 27, 0.5);
}

.line-number {
  color: #52525b;
  user-select: none;
  width: 32px;
  text-align: right;
  flex-shrink: 0;
}

.embedded-execution-block {
  margin-top: 16px;
  border-left: 2px solid rgba(34, 211, 238, 0.5);
  padding-left: 12px;
  padding-top: 8px;
  padding-bottom: 8px;
  background: rgba(34, 211, 238, 0.05);
  border-radius: 0 8px 8px 0;
}

.exec-command-line {
  font-size: 14px;
}

.exec-output-line {
  font-size: 12px;
  opacity: 0.8;
}

.exec-status-success,
.exec-status-failed,
.exec-status-running {
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
}

.post-actions-panel {
  border-top: 1px solid rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.05);
  padding: 16px;
  flex-shrink: 0;
}

.post-actions-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.post-actions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.post-action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(9, 10, 13, 0.5);
  border: 1px solid #27272a;
}

.action-content {
  flex: 1;
  min-width: 0;
}

.action-command {
  color: #fbbf24;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 14px;
  background: #090a0d;
  padding: 4px 8px;
  border-radius: 4px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
