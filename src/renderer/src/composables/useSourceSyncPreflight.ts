import { useDialog, useMessage } from 'naive-ui'
import { usePackagesStore } from '@/stores/packages'
import type { ScoopSourceStatus } from '@/types'

const SILENT_SYNC_OVERDUE_MS = 60_000

function getDynamicAgeMs(status: ScoopSourceStatus): number | undefined {
  if (typeof status.lastUpdateMs === 'number') {
    return Math.max(0, Date.now() - status.lastUpdateMs)
  }
  return status.ageMs
}

function shouldSyncSource(status: ScoopSourceStatus): boolean {
  const ageMs = getDynamicAgeMs(status)
  if (ageMs === undefined) return status.stale
  return ageMs >= status.intervalMs
}

function formatLastUpdate(status: ScoopSourceStatus): string {
  if (!status.lastUpdate) return '尚未同步'
  if (!status.lastUpdateMs) return status.lastUpdate
  return new Date(status.lastUpdateMs).toLocaleString('zh-CN')
}

export function useSourceSyncPreflight() {
  const packagesStore = usePackagesStore()
  const dialog = useDialog()
  const message = useMessage()

  async function syncSourceThenContinue(reason: string) {
    const result = await packagesStore.syncSources({ reason })
    await packagesStore.loadUpdatable({ syncBuckets: false })

    if (!result?.success && result?.reason !== 'fresh') {
      message.warning(result?.error || '软件源同步失败，将继续使用本地缓存')
    }
    return true
  }

  async function ensureSourceReadyBeforeCommand(actionLabel: string, reason: string): Promise<boolean> {
    const status = packagesStore.sourceStatus || await packagesStore.loadSourceStatus()
    if (!shouldSyncSource(status)) return true

    const ageMs = getDynamicAgeMs(status)
    const overdueMs = ageMs === undefined ? Number.POSITIVE_INFINITY : ageMs - status.intervalMs

    // 刚刚跨过 Scoop 的 last_update 间隔时，不弹窗打扰，直接同步后继续。
    if (overdueMs >= 0 && overdueMs <= SILENT_SYNC_OVERDUE_MS) {
      return syncSourceThenContinue(reason)
    }

    return new Promise<boolean>((resolve) => {
      dialog.warning({
        title: '软件源需要同步',
        content: `Scoop 上次同步时间：${formatLastUpdate(status)}。建议先同步软件源，再${actionLabel}。`,
        positiveText: '先同步再继续',
        negativeText: '使用当前缓存',
        closable: false,
        onPositiveClick: async () => {
          const result = await syncSourceThenContinue(reason)
          resolve(result)
        },
        onNegativeClick: () => {
          resolve(true)
        },
      })
    })
  }

  return { ensureSourceReadyBeforeCommand }
}
