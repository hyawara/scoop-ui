import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PackageInfo, InstallOptions, ProgressData } from '@/types'

export const usePackagesStore = defineStore('packages', () => {
  const installed = ref<PackageInfo[]>([])
  const updatable = ref<PackageInfo[]>([])
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
      await window.scoopAPI.update(name)
      await loadInstalled()
      await loadUpdatable()
    } finally {
      loading.value = false
      window.scoopAPI.removeProgressListener()
    }
  }

  async function updateBatch(names: string[]) {
    if (names.length === 0) return
    loading.value = true
    try {
      window.scoopAPI.onProgress((data: ProgressData) => {
        progress.value = data
      })
      for (const name of names) {
        await window.scoopAPI.update(name)
      }
      await loadInstalled()
      await loadUpdatable()
    } finally {
      loading.value = false
      window.scoopAPI.removeProgressListener()
    }
  }

  return {
    installed, updatable, searchResults, loading, progress, descriptionsLoading,
    loadInstalled, loadUpdatable, search, install, uninstall, update, updateBatch
  }
})
