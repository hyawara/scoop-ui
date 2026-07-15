import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  PackageInfo,
  UpdatableInfo,
  ManifestChangedInfo,
  InstallOptions,
  ProgressData,
  CheckUpdatesOptions,
  ScoopSourceStatus,
  ScoopSourceSyncResult,
} from '@/types'

export const usePackagesStore = defineStore('packages', () => {
  const installed = ref<PackageInfo[]>([])
  const updatable = ref<UpdatableInfo[]>([])
  const manifestChanged = ref<ManifestChangedInfo[]>([])
  const updateCheckSkipped = ref<{
    name: string
    installedVersion: string
    latestVersion: string
    reason: string
  }[]>([])
  const searchResults = ref<PackageInfo[]>([])
  const loading = ref(false)
  const searching = ref(false)
  const progress = ref<ProgressData | null>(null)
  const descriptionsLoading = ref(false)
  const searchEngine = ref<{ installed: boolean; engine: 'scoop-search' | 'native'; path?: string }>({
    installed: false,
    engine: 'native',
  })
  const updateCheckPhase = ref<'idle' | 'syncing' | 'comparing' | 'done' | 'error'>('idle')
  const updateCheckText = ref('')
  const updateCheckWarnings = ref<string[]>([])
  const updateCheckElapsedMs = ref(0)
  const sourceStatus = ref<ScoopSourceStatus | null>(null)
  const sourceSyncPhase = ref<'idle' | 'checking' | 'syncing' | 'done' | 'skipped' | 'error'>('idle')
  const sourceSyncText = ref('')
  const sourceSyncError = ref('')
  let sourceSyncPromise: Promise<ScoopSourceSyncResult | null> | null = null

  async function loadInstalled() {
    loading.value = true
    try {
      installed.value = await window.scoopAPI.listInstalled()
    } catch {
      installed.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadSourceStatus() {
    sourceSyncPhase.value = sourceSyncPhase.value === 'syncing' ? 'syncing' : 'checking'
    try {
      sourceStatus.value = await window.scoopAPI.getSourceStatus()
      if (sourceStatus.value.error) {
        sourceSyncPhase.value = 'error'
        sourceSyncError.value = sourceStatus.value.error
        sourceSyncText.value = '无法读取软件源状态'
      } else if (sourceStatus.value.stale) {
        sourceSyncPhase.value = 'idle'
        sourceSyncText.value = '软件源需要同步'
      } else {
        sourceSyncPhase.value = 'done'
        sourceSyncText.value = '软件源状态新鲜'
      }
      return sourceStatus.value
    } catch (error: any) {
      sourceSyncPhase.value = 'error'
      sourceSyncError.value = error?.message || String(error)
      sourceSyncText.value = '无法读取软件源状态'
      sourceStatus.value = {
        intervalMs: 3 * 60 * 60 * 1000,
        stale: true,
        checkedAt: new Date().toISOString(),
        error: sourceSyncError.value,
      }
      return sourceStatus.value
    }
  }

  async function syncSources(options: { force?: boolean; reason?: string } = {}) {
    if (sourceSyncPromise) return sourceSyncPromise

    sourceSyncPhase.value = 'syncing'
    sourceSyncError.value = ''
    sourceSyncText.value = options.force
      ? '正在同步 Scoop 与软件源...'
      : '软件源过期，正在后台同步...'

    sourceSyncPromise = (async () => {
      try {
        const result = await window.scoopAPI.syncSources(options)
        sourceStatus.value = result.status
        if (result.success) {
          sourceSyncPhase.value = result.skipped ? 'skipped' : 'done'
          sourceSyncText.value = result.skipped ? '软件源仍然新鲜' : '软件源同步完成'
        } else if (result.reason === 'busy') {
          sourceSyncPhase.value = 'skipped'
          sourceSyncText.value = '已有 Scoop 命令在运行，稍后再同步'
          sourceSyncError.value = result.error || ''
        } else {
          sourceSyncPhase.value = 'error'
          sourceSyncText.value = '软件源同步失败'
          sourceSyncError.value = result.error || result.stderr || '未知错误'
        }
        return result
      } catch (error: any) {
        sourceSyncPhase.value = 'error'
        sourceSyncText.value = '软件源同步失败'
        sourceSyncError.value = error?.message || String(error)
        return null
      } finally {
        sourceSyncPromise = null
      }
    })()

    return sourceSyncPromise
  }

  async function loadUpdatable(options: CheckUpdatesOptions = {}) {
    updateCheckPhase.value = 'syncing'
    updateCheckText.value = options.syncBuckets ? '正在同步 Bucket 仓库...' : '正在读取本地软件清单...'
    updateCheckWarnings.value = []
    try {
      const phaseTimer = window.setTimeout(() => {
        updateCheckPhase.value = 'comparing'
        updateCheckText.value = '正在高速对比本地版本...'
      }, 350)

      try {
        const result = await window.scoopAPI.checkUpdates({ syncBuckets: options.syncBuckets === true })
        updatable.value = result.updates
        manifestChanged.value = result.changed || []
        updateCheckSkipped.value = result.skipped || []
        updateCheckWarnings.value = result.warnings || []
        updateCheckElapsedMs.value = result.elapsedMs || 0
        updateCheckPhase.value = 'done'
        if (result.updates.length > 0) {
          updateCheckText.value = `发现 ${result.updates.length} 个可更新软件`
        } else if ((result.changed || []).length > 0) {
          updateCheckText.value = `发现 ${result.changed.length} 个清单变更待确认`
        } else {
          updateCheckText.value = '所有软件均为最新版本'
        }
      } finally {
        window.clearTimeout(phaseTimer)
      }
    } catch {
      updatable.value = []
      manifestChanged.value = []
      updateCheckSkipped.value = []
      updateCheckPhase.value = 'error'
      updateCheckText.value = '更新检查失败'
    }
  }

  // 统一入口：按策略同步软件源，再做本地 manifest 对比。
  async function refreshUpdatable(options: {
    sync?: 'none' | 'auto' | 'force'
    background?: boolean
    reason?: string
  } = {}) {
    const syncMode = options.sync ?? 'auto'
    const status = await loadSourceStatus()
    const shouldSync = syncMode === 'force' || (syncMode === 'auto' && status.stale)

    if (!shouldSync) {
      await loadUpdatable({ syncBuckets: false })
      return
    }

    if (options.background) {
      void syncSources({ force: syncMode === 'force', reason: options.reason }).then(async (result) => {
        if (result?.success) {
          await loadUpdatable({ syncBuckets: false })
        }
      })
      await loadUpdatable({ syncBuckets: false })
      return
    }

    const result = await syncSources({ force: syncMode === 'force', reason: options.reason })
    if (!result || !result.success) {
      await loadUpdatable({ syncBuckets: false })
      return
    }

    await loadUpdatable({ syncBuckets: false })
  }

  async function search(query: string) {
    if (!query.trim()) {
      searchResults.value = []
      return
    }
    searching.value = true
    try {
      searchResults.value = await window.scoopAPI.search(query)
      // 异步批量获取软件描述（限制前 30 个包，并发 3 个）
      fetchDescriptions(searchResults.value.slice(0, 30))
    } catch {
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }

  async function loadSearchEngineStatus(force = false) {
    try {
      searchEngine.value = await window.scoopAPI.searchEngineStatus(force)
    } catch {
      searchEngine.value = { installed: false, engine: 'native' }
    }
  }

  async function installSearchEngine() {
    const result = await window.scoopAPI.installSearchEngine()
    await loadSearchEngineStatus(true)
    return result
  }

  async function fetchDescriptions(pkgs: PackageInfo[]) {
    descriptionsLoading.value = true
    const concurrency = 3
    for (let i = 0; i < pkgs.length; i += concurrency) {
      const batch = pkgs.slice(i, i + concurrency)
      await Promise.all(
        batch.map(async (pkg) => {
          if (!pkg.description) {
            try {
              const info = await window.scoopAPI.fetchPackageInfo(pkg.name)
              if (info?.description) {
                // 在 searchResults 中找到对应项更新描述
                const found = searchResults.value.find((r) => r.name === pkg.name)
                if (found) found.description = info.description
              }
            } catch { /* 静默忽略 */ }
          }
        })
      )
    }
    descriptionsLoading.value = false
  }

  async function install(name: string, options?: InstallOptions) {
    loading.value = true
    try {
      window.scoopAPI.onProgress((data: ProgressData) => {
        progress.value = data
      })
      const result = await window.scoopAPI.install(name, options)
      await loadInstalled()
      if (!result.success) {
        throw new Error(result.error || (result.aborted ? `${name} 安装已中止` : `${name} 安装失败`))
      }
    } finally {
      loading.value = false
      window.scoopAPI.removeProgressListener()
    }
  }

  async function uninstall(name: string, global = false) {
    loading.value = true
    try {
      const result = await window.scoopAPI.uninstall(name, global)
      await loadInstalled()
      if (!result.success) {
        throw new Error(result.error || (result.aborted ? `${name} 卸载已中止` : `${name} 卸载失败`))
      }
    } finally {
      loading.value = false
    }
  }

  async function update(name?: string) {
    loading.value = true
    try {
      window.scoopAPI.onProgress((data: ProgressData) => {
        progress.value = data
      })
      // 后端返回原生命令退出结果；随后重新读取 list/status 做终态对齐
      const result = await window.scoopAPI.update(name)
      await loadInstalled()
      await loadUpdatable()
      await loadSourceStatus()
      if (!result.success) {
        throw new Error(result.error || '更新失败')
      }
    } finally {
      loading.value = false
      window.scoopAPI.removeProgressListener()
    }
  }

  return {
    installed, updatable, manifestChanged, updateCheckSkipped, searchResults, loading, searching, progress, descriptionsLoading,
    searchEngine, updateCheckPhase, updateCheckText, updateCheckWarnings, updateCheckElapsedMs,
    sourceStatus, sourceSyncPhase, sourceSyncText, sourceSyncError,
    loadInstalled, loadSourceStatus, syncSources, loadUpdatable, refreshUpdatable, search, loadSearchEngineStatus, installSearchEngine, install, uninstall, update
  }
})
