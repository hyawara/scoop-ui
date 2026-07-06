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
}

const progressMap = reactive<Map<string, PackageProgress>>(new Map())
// success / error 态的自动归档定时器，避免堆积泄漏
const archiveTimers = new Map<string, ReturnType<typeof setTimeout>>()

const SUCCESS_ARCHIVE_MS = 2000
const ERROR_ARCHIVE_MS = 3000

const PATTERN_PERCENT = /\((\d+)%\)/
const PATTERN_PERCENT_ALT = /(\d+)%/

function parsePercent(line: string): number | null {
  let m = PATTERN_PERCENT.exec(line)
  if (m) return parseInt(m[1], 10)
  m = PATTERN_PERCENT_ALT.exec(line)
  if (m) return parseInt(m[1], 10)
  return null
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

    p.logs.push(message)

    // 解析 Aria2 / 下载百分比
    const pct = parsePercent(message)
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

  /** 失败：标记 error，停留 3 秒后自动归档（清除） */
  function failUpdate(name: string) {
    clearTimer(name)
    const p = progressMap.get(name)
    if (p) {
      p.phase = 'error'
    } else {
      progressMap.set(name, { phase: 'error', percent: 0, logs: [] })
    }
    archiveTimers.set(name, setTimeout(() => {
      progressMap.delete(name)
      archiveTimers.delete(name)
    }, ERROR_ARCHIVE_MS))
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
    clearAll,
  }
}
