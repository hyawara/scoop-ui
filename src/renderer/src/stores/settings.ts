import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CacheInfo, ScoopEnv, ProxyConfig } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const cacheInfo = ref<CacheInfo>({ size: 0, files: 0 })
  const scoopEnv = ref<ScoopEnv>({ scoop: '', global: '' })
  const proxy = ref<ProxyConfig>({ enabled: false, address: '', type: 'http' })
  const loading = ref(false)

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
    loading.value = true
    try {
      await window.scoopAPI.setProxy(address)
      proxy.value = { enabled: true, address, type: address.includes('socks5') ? 'socks5' : 'http' }
    } finally {
      loading.value = false
    }
  }

  async function removeProxy() {
    loading.value = true
    try {
      await window.scoopAPI.removeProxy()
      proxy.value = { enabled: false, address: '', type: 'http' }
    } finally {
      loading.value = false
    }
  }

  return {
    cacheInfo, scoopEnv, proxy, loading,
    loadCacheInfo, clearCache, loadEnv, migrateScoop, setProxy, removeProxy
  }
})
