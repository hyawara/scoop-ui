import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CacheInfo, ScoopEnv, ProxyConfig } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const cacheInfo = ref<CacheInfo>({ size: 0, files: 0 })
  const scoopEnv = ref<ScoopEnv>({ scoop: '', global: '' })
  const proxy = ref<ProxyConfig>({ enabled: false, address: '', type: 'http' })
  const diskSpace = ref<{ Used: number; Free: number; Name?: string } | null>(null)
  const aria2Enabled = ref(false)
  const loading = ref(false)
  const proxyLoading = ref(false)

  const bucketCount = ref(0)
  const installedCount = ref(0)
  const globalCount = ref(0)

  async function loadCacheInfo() {
    try {
      cacheInfo.value = await window.scoopAPI.cache()
    } catch {
      cacheInfo.value = { size: 0, files: 0 }
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

  async function setProxy(address: string) {
    proxyLoading.value = true
    try {
      await window.scoopAPI.setProxy(address)
      proxy.value = { enabled: true, address, type: address.includes('socks5') ? 'socks5' : 'http' }
    } finally {
      proxyLoading.value = false
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
      aria2Enabled.value = res.enabled
    } catch {
      aria2Enabled.value = false
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
    try {
      const installed = await window.scoopAPI.listInstalled()
      installedCount.value = installed.length
      globalCount.value = installed.filter((p: any) => p.global).length
    } catch {
      installedCount.value = 0
      globalCount.value = 0
    }
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
    cacheInfo, scoopEnv, proxy, diskSpace, aria2Enabled, loading, proxyLoading,
    bucketCount, installedCount, globalCount,
    loadCacheInfo, clearCache, loadEnv, loadDiskSpace, checkAria2, installAria2, migrateScoop, setProxy, setProxyConfig, removeProxy, loadProxy, loadEcoStats
  }
})
