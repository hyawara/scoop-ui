import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CacheInfo, ScoopEnv, ProxyConfig } from '@/types'
import { usePackagesStore } from '@/stores/packages'

export const useSettingsStore = defineStore('settings', () => {
  const packagesStore = usePackagesStore()

  const cacheInfo = ref<CacheInfo>({ size: 0, unit: 'MB', files: 0 })
  const scoopEnv = ref<ScoopEnv>({ scoop: '', global: '' })
  const proxy = ref<ProxyConfig>({ enabled: false, address: '', type: 'http' })
  const diskSpace = ref<{ Used: number; Free: number; Name?: string } | null>(null)
  const aria2Installed = ref(false)
  const aria2Enabled = ref(false)
  const aria2Loading = ref(false)
  const loading = ref(false)
  const proxyLoading = ref(false)

  const bucketCount = ref(0)
  // 已安装数 / 全局安装数直接派生自 packages store，避免冗余 API 调用与数据不同步
  const installedCount = computed(() => packagesStore.installed.length)
  const globalCount = computed(() => packagesStore.installed.filter((p) => p.global).length)

  async function loadCacheInfo() {
    try {
      cacheInfo.value = await window.scoopAPI.cache()
    } catch {
      cacheInfo.value = { size: 0, unit: 'MB', files: 0 }
    }
  }

  async function clearCache() {
    loading.value = true
    try {
      await window.scoopAPI.clearCache()
      // 等待一小段时间让文件系统完成删除
      await new Promise(resolve => setTimeout(resolve, 300))
      await loadCacheInfo()
    } finally {
      loading.value = false
    }
  }

  async function loadEnv() {
    try {
      scoopEnv.value = await window.scoopAPI.getEnv()
    } catch {
      scoopEnv.value = { scoop: '', global: '' }
    }
  }

  async function loadDiskSpace() {
    try {
      diskSpace.value = await window.scoopAPI.getDiskSpace()
    } catch {
      diskSpace.value = null
    }
  }

  async function migrateScoop(newPath: string) {
    loading.value = true
    try {
      await window.scoopAPI.migrateScoop(newPath)
      await loadEnv()
    } finally {
      loading.value = false
    }
  }

  async function setProxyConfig(protocol: 'http' | 'socks5', host: string, port: string) {
    const addr = protocol === 'socks5' ? `socks5://${host}:${port}` : `${host}:${port}`
    proxyLoading.value = true
    try {
      await window.scoopAPI.setProxy(addr)
      proxy.value = { enabled: true, address: addr, type: protocol }
    } finally {
      proxyLoading.value = false
    }
  }

  async function checkAria2() {
    try {
      const res = await window.scoopAPI.checkAria2()
      aria2Installed.value = res.installed
      aria2Enabled.value = res.enabled
    } catch {
      aria2Installed.value = false
      aria2Enabled.value = false
    }
  }

  async function setAria2Enabled(enabled: boolean) {
    aria2Loading.value = true
    try {
      await window.scoopAPI.setAria2Enabled(enabled)
      aria2Enabled.value = enabled
    } finally {
      aria2Loading.value = false
    }
  }

  async function installAria2() {
    loading.value = true
    try {
      await window.scoopAPI.install('aria2')
      await checkAria2()
    } finally {
      loading.value = false
    }
  }

  async function loadEcoStats() {
    try {
      const buckets = await window.scoopAPI.listBuckets()
      bucketCount.value = buckets.length
    } catch {
      bucketCount.value = 0
    }
    // installedCount / globalCount 已改为派生自 packages store，无需在此加载
  }

  async function removeProxy() {
    proxyLoading.value = true
    try {
      await window.scoopAPI.removeProxy()
      proxy.value = { enabled: false, address: '', type: 'http' }
    } finally {
      proxyLoading.value = false
    }
  }

  async function loadProxy() {
    try {
      proxy.value = await window.scoopAPI.getProxy()
    } catch {
      proxy.value = { enabled: false, address: '', type: 'http' }
    }
  }

  return {
    cacheInfo, scoopEnv, proxy, diskSpace, aria2Installed, aria2Enabled, aria2Loading, loading, proxyLoading,
    bucketCount, installedCount, globalCount,
    loadCacheInfo, clearCache, loadEnv, loadDiskSpace, checkAria2, setAria2Enabled, installAria2, migrateScoop, setProxyConfig, removeProxy, loadProxy, loadEcoStats
  }
})
