import { reactive } from 'vue'

/**
 * 极简行内状态：只表达“正在由 Scoop 原生命令接管 / 已结束”。
 * 终端日志不再挂在这里，成功失败也不从日志解析，而由命令结束后的 list/status 真实状态对齐。
 */
export type PackagePhase = 'downloading' | 'installing' | 'success' | 'error'

export interface PackageProgress {
  phase: PackagePhase
  percent: number
  error?: string
}

const progressMap = reactive<Map<string, PackageProgress>>(new Map())
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

export function usePackageProgress() {
  function clearTimer(name: string) {
    const t = archiveTimers.get(name)
    if (t) {
      clearTimeout(t)
      archiveTimers.delete(name)
    }
  }

  function startUpdate(name: string) {
    clearTimer(name)
    progressMap.set(name, { phase: 'downloading', percent: 0 })
  }

  function handleLog(name: string, message: string) {
    const p = progressMap.get(name)
    if (!p || (p.phase !== 'downloading' && p.phase !== 'installing')) return

    const lastLine = message.replace(/\r\n/g, '\n').split('\n').pop()?.split('\r').pop() ?? ''
    const pct = parsePercent(lastLine)
    if (pct !== null) p.percent = pct

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

  function finishUpdate(name: string) {
    clearTimer(name)
    const p = progressMap.get(name)
    if (p) {
      p.phase = 'success'
      p.percent = 100
    } else {
      progressMap.set(name, { phase: 'success', percent: 100 })
    }
    archiveTimers.set(name, setTimeout(() => {
      progressMap.delete(name)
      archiveTimers.delete(name)
    }, SUCCESS_ARCHIVE_MS))
  }

  function failUpdate(name: string, errorSummary?: string) {
    clearTimer(name)
    const p = progressMap.get(name)
    if (p) {
      p.phase = 'error'
      p.error = errorSummary
    } else {
      progressMap.set(name, { phase: 'error', percent: 0, error: errorSummary })
    }
  }

  function getProgress(name: string): PackageProgress | undefined {
    return progressMap.get(name)
  }

  function hasProgress(name: string): boolean {
    return progressMap.has(name)
  }

  function isActive(name: string): boolean {
    const p = progressMap.get(name)
    return !!p && (p.phase === 'downloading' || p.phase === 'installing')
  }

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
    progressMap,
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
