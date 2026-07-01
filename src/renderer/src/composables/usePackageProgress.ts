import { ref, reactive } from 'vue'

export interface PackageProgress {
  phase: 'downloading' | 'installing' | 'success'
  percent: number
  logs: string[]
}

const progressMap = reactive<Map<string, PackageProgress>>(new Map())

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
  function startUpdate(name: string) {
    progressMap.set(name, {
      phase: 'downloading',
      percent: 0,
      logs: [],
    })
  }

  function handleLog(name: string, message: string) {
    if (!message) return
    const p = progressMap.get(name)
    if (!p) return

    p.logs.push(message)

    // Parse Aria2 / download percentage
    const pct = parsePercent(message)
    if (pct !== null) {
      p.percent = pct
    }

    // Detect phase transitions from log content
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
    // 瞬间蒸发：直接清除，脉冲圆圈立即消失
    progressMap.delete(name)
  }

  function failUpdate(name: string) {
    progressMap.delete(name)
  }

  function getProgress(name: string): PackageProgress | undefined {
    return progressMap.get(name)
  }

  function hasProgress(name: string): boolean {
    return progressMap.has(name)
  }

  function clearAll() {
    progressMap.clear()
  }

  return {
    startUpdate,
    handleLog,
    finishUpdate,
    failUpdate,
    getProgress,
    hasProgress,
    clearAll,
  }
}
