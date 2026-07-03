import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ScoopStatus, ProgressData } from '@/types'

export const useAppStore = defineStore('app', () => {
  const scoopStatus = ref<ScoopStatus>({ installed: false, checking: true })
  const loading = ref(false)
  const progress = ref<ProgressData | null>(null)

  async function checkScoop() {
    scoopStatus.value.checking = true
    try {
      const result = await window.scoopAPI.checkScoop()
      scoopStatus.value = { ...result, checking: false }
    } catch {
      scoopStatus.value = { installed: false, checking: false }
    }
  }

  async function installScoop(options?: { scoopPath?: string; globalPath?: string }) {
    loading.value = true
    try {
      window.scoopAPI.onProgress((data: ProgressData) => {
        progress.value = data
      })
      await window.scoopAPI.installScoop(options)
      await checkScoop()
    } finally {
      loading.value = false
      window.scoopAPI.removeProgressListener()
    }
  }

  return { scoopStatus, loading, progress, checkScoop, installScoop }
})
