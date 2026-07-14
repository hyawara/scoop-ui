import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PackageInfo, UpdatableInfo, ManifestChangedInfo, InstallOptions, ProgressData } from '@/types'

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

  async function loadUpdatable() {
    updateCheckPhase.value = 'syncing'
    updateCheckText.value = '正在同步 Bucket 仓库...'
    updateCheckWarnings.value = []
    try {
      const phaseTimer = window.setTimeout(() => {
        updateCheckPhase.value = 'comparing'
        updateCheckText.value = '正在高速对比本地版本...'
      }, 350)

      try {
        const result = await window.scoopAPI.checkUpdates()
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

  // 启动自检：直接使用主进程的并行 git 同步 + 内存 manifest 对比。
  async function refreshUpdatable() {
    await loadUpdatable()
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
      await window.scoopAPI.install(name, options)
      await loadInstalled()
    } finally {
      loading.value = false
      window.scoopAPI.removeProgressListener()
    }
  }

  async function uninstall(name: string, global = false) {
    loading.value = true
    try {
      await window.scoopAPI.uninstall(name, global)
      await loadInstalled()
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
    loadInstalled, loadUpdatable, refreshUpdatable, search, loadSearchEngineStatus, installSearchEngine, install, uninstall, update
  }
})
