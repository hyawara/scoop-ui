import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PackageInfo, UpdatableInfo, InstallOptions, ProgressData } from '@/types'

export const usePackagesStore = defineStore('packages', () => {
  const installed = ref<PackageInfo[]>([])
  const updatable = ref<UpdatableInfo[]>([])
  const searchResults = ref<PackageInfo[]>([])
  const loading = ref(false)
  const progress = ref<ProgressData | null>(null)
  const descriptionsLoading = ref(false)

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
    try {
      updatable.value = await window.scoopAPI.listUpdatable()
    } catch {
      updatable.value = []
    }
  }

  // 启动自检：先异步执行 `scoop update`（更新 scoop 自身与 buckets），
  // 再执行 `scoop status` 同步可更新列表。update 失败不阻断 status 同步。
  async function refreshUpdatable() {
    try {
      await window.scoopAPI.updateSelf()
    } catch {
      // 更新 scoop/buckets 失败（如网络问题）不阻断，仍尝试同步 status
    }
    await loadUpdatable()
  }

  async function search(query: string) {
    if (!query.trim()) {
      searchResults.value = []
      return
    }
    loading.value = true
    try {
      searchResults.value = await window.scoopAPI.search(query)
      // 异步批量获取软件描述（限制前 30 个包，并发 3 个）
      fetchDescriptions(searchResults.value.slice(0, 30))
    } catch {
      searchResults.value = []
    } finally {
      loading.value = false
    }
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
    installed, updatable, searchResults, loading, progress, descriptionsLoading,
    loadInstalled, loadUpdatable, refreshUpdatable, search, install, uninstall, update
  }
})
