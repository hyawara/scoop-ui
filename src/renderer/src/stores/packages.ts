import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PackageInfo, InstallOptions, ProgressData } from '@/types'

export const usePackagesStore = defineStore('packages', () => {
  const installed = ref<PackageInfo[]>([])
  const updatable = ref<PackageInfo[]>([])
  const searchResults = ref<PackageInfo[]>([])
  const loading = ref(false)
  const progress = ref<ProgressData | null>(null)

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
    loading.value = true
    try {
      updatable.value = await window.scoopAPI.listUpdatable()
    } catch {
      updatable.value = []
    } finally {
      loading.value = false
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
    } catch {
      searchResults.value = []
    } finally {
      loading.value = false
    }
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

  return {
    installed, updatable, searchResults, loading, progress,
    loadInstalled, loadUpdatable, search, install, uninstall, update
  }
})
