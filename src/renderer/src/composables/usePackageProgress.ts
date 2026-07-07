import { reactive } from 'vue'

/**
 * 任务队列状态机相位：
 * - queued      排队等待中（已被调度器接管，尚未执行）
 * - downloading 正在下载（可解析百分比）
 * - installing  正在安装/解压/链接（无百分比，走无限旋转）
 * - success     执行成功（绿色勾选徽章，停留 2 秒后归档）
 * - error       执行失败（红色徽章，停留 3 秒后归档）
 */
export type PackagePhase = 'queued' | 'downloading' | 'installing' | 'success' | 'error'

export interface PackageProgress {
  phase: PackagePhase
  percent: number
  logs: string[]
  // error 相位时的错误摘要（通常是末尾 3 行关键日志），用于弹窗高亮显示
  error?: string
}

const progressMap = reactive<Map<string, PackageProgress>>(new Map())
// success / error 态的自动归档定时器，避免堆积泄漏
const archiveTimers = new Map<string, ReturnType<typeof setTimeout>>()

const SUCCESS_ARCHIVE_MS = 2000

const PATTERN_PERCENT = /\((\d+)%\)/
const PATTERN_PERCENT_ALT = /(\d+)%/

function parsePercent(line: string): number | null {
  let m = PATTERN_PERCENT.exec(line)
  if (m) return parseInt(m[1], 10)
  m = PATTERN_PERCENT_ALT.exec(line)
  if (m) return parseInt(m[1], 10)
  return null
}

/**
 * 把一段可能包含 \r（回车覆盖）与 \n（换行）的流式输出，正确合并进现有 logs 数组。
 *
 * Scoop 下载大文件时会用 \r 把光标移回行首反复重绘同一行进度条（如
 * `12.3 MB / 45.6 MB (27%)`），若无脑 push 会堆出成百上千行"卡死"感。
 * 处理规则：
 *  1. 先把 \r\n 归一成 \n（Windows CRLF），避免被当成回车覆盖。
 *  2. 按 \n 切分成若干片段：第一个片段续接当前流，其余片段各自成新行。
 *  3. 每个片段内若含 \r，只保留最后一个 \r 之后的内容（即进度条最终态）。
 *  4. 片段合并到 logs：
 *     - 第一个片段：若它自身带 \r（是纯覆盖更新），或当前末行仍是"进行中"的
 *       同类进度行，则覆盖末行；否则续接到末行尾部。
 *     - 后续片段：一律 push 为新行。
 */
function appendWithCarriageReturn(logs: string[], chunk: string): void {
  const normalized = chunk.replace(/\r\n/g, '\n')
  const segments = normalized.split('\n')

  for (let i = 0; i < segments.length; i++) {
    const raw = segments[i]
    const hasCr = raw.includes('\r')
    // 只保留最后一个 \r 之后的内容（进度条重绘的最终态）
    const text = hasCr ? raw.slice(raw.lastIndexOf('\r') + 1) : raw

    if (i === 0) {
      // 首段：决定是覆盖末行还是续接
      if (logs.length === 0) {
        logs.push(text)
      } else if (hasCr) {
        // 带回车 → 覆盖当前末行（进度条刷新）
        logs[logs.length - 1] = text
      } else {
        // 不带回车 → 视为上一 chunk 未完成行的续接
        logs[logs.length - 1] = logs[logs.length - 1] + text
      }
    } else {
      // 换行后的新段，各自独立成行
      logs.push(text)
    }
  }
}

export function usePackageProgress() {
  function clearTimer(name: string) {
    const t = archiveTimers.get(name)
    if (t) {
      clearTimeout(t)
      archiveTimers.delete(name)
    }
  }

  /**
   * 批量入队：用户点击"批量更新"的瞬间调用。
   * 把一整批包同时标记为 queued，让 UI 立刻呈现"系统已接管 N 个任务"的正反馈。
   */
  function enqueue(names: string[]) {
    for (const name of names) {
      clearTimer(name)
      progressMap.set(name, { phase: 'queued', percent: 0, logs: [] })
    }
  }

  /** 单个入队（单包更新/下载走队列时使用，状态流转与批量完全一致） */
  function enqueueOne(name: string) {
    clearTimer(name)
    progressMap.set(name, { phase: 'queued', percent: 0, logs: [] })
  }

  /** 调度器激活：把某个 queued 的包提升为 downloading（processing 起点） */
  function startProcessing(name: string) {
    clearTimer(name)
    const p = progressMap.get(name)
    if (p) {
      p.phase = 'downloading'
      p.percent = 0
    } else {
      progressMap.set(name, { phase: 'downloading', percent: 0, logs: [] })
    }
  }

  /** 直接开始（商店安装等无排队场景，向后兼容） */
  function startUpdate(name: string) {
    clearTimer(name)
    progressMap.set(name, { phase: 'downloading', percent: 0, logs: [] })
  }

  function handleLog(name: string, message: string) {
    if (!message) return
    const p = progressMap.get(name)
    if (!p) return
    // 仅在真正执行中的相位解析日志，queued/success/error 忽略
    if (p.phase !== 'downloading' && p.phase !== 'installing') return

    // 处理 \r 覆盖 / \n 分行，避免进度条把日志刷成成百上千行
    appendWithCarriageReturn(p.logs, message)

    // 从最新一行解析下载百分比（进度条最终态在末行）
    const lastLine = p.logs[p.logs.length - 1] ?? ''
    const pct = parsePercent(lastLine)
    if (pct !== null) {
      p.percent = pct
    }

    // 从日志内容侦测相位跃迁：下载 → 安装
    const lower = message.toLowerCase()
    if (
      lower.includes('installing') ||
      lower.includes('extracting') ||
      lower.includes('unzip') ||
      lower.includes('running post-install') ||
      lower.includes('linking')
    ) {
      p.phase = 'installing'
    }
  }

  /** 成功：标记 success，停留 2 秒后自动归档（清除） */
  function finishUpdate(name: string) {
    clearTimer(name)
    const p = progressMap.get(name)
    if (p) {
      p.phase = 'success'
      p.percent = 100
    } else {
      progressMap.set(name, { phase: 'success', percent: 100, logs: [] })
    }
    archiveTimers.set(name, setTimeout(() => {
      progressMap.delete(name)
      archiveTimers.delete(name)
    }, SUCCESS_ARCHIVE_MS))
  }

  /**
   * 失败：标记 error 并常驻（不自动归档），强制用户正视失败结果。
   * error 态会一直停留在 UI 上，直到用户手动重试（重新 enqueue/startUpdate 覆盖）
   * 或主动关闭/清理。这是"杜绝伪成功"需求的关键——失败必须显式暴露，不能悄悄消失。
   * @param name 包名
   * @param errorSummary 错误摘要（通常是末尾 3 行关键日志），用于弹窗高亮
   */
  function failUpdate(name: string, errorSummary?: string) {
    clearTimer(name)
    const p = progressMap.get(name)
    if (p) {
      p.phase = 'error'
      if (errorSummary) p.error = errorSummary
    } else {
      progressMap.set(name, { phase: 'error', percent: 0, logs: [], error: errorSummary })
    }
    // 注意：不设归档定时器，error 态常驻直到用户手动处理
  }

  function getProgress(name: string): PackageProgress | undefined {
    return progressMap.get(name)
  }

  function hasProgress(name: string): boolean {
    return progressMap.has(name)
  }

  /** 是否处于活跃执行中（queued/downloading/installing），success/error 不算 */
  function isActive(name: string): boolean {
    const p = progressMap.get(name)
    return !!p && (p.phase === 'queued' || p.phase === 'downloading' || p.phase === 'installing')
  }

  /** 手动清除单个包的进度记录（error 态用户点"关闭"/重试前调用） */
  function clearProgress(name: string) {
    clearTimer(name)
    progressMap.delete(name)
  }

  function clearAll() {
    for (const t of archiveTimers.values()) clearTimeout(t)
    archiveTimers.clear()
    progressMap.clear()
  }

  return {
    enqueue,
    enqueueOne,
    startProcessing,
    startUpdate,
    handleLog,
    finishUpdate,
    failUpdate,
    getProgress,
    hasProgress,
    isActive,
    clearProgress,
    clearAll,
  }
}
