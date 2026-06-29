/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface InstallOptions {
  global?: boolean
  skipCheck?: boolean
  independent?: boolean
}

interface ProgressData {
  type: 'download' | 'install' | 'uninstall' | 'update' | 'message'
  package: string
  percent?: number
  message: string
}

interface Window {
  scoopAPI: {
    checkScoop: () => Promise<{ installed: boolean; path?: string }>
    installScoop: () => Promise<void>
    search: (query: string) => Promise<any[]>
    install: (name: string, options?: InstallOptions) => Promise<void>
    uninstall: (name: string, global?: boolean) => Promise<void>
    update: (name?: string) => Promise<void>
    cleanup: () => Promise<void>
    cache: () => Promise<{ size: number; files: number }>
    clearCache: () => Promise<void>
    listInstalled: () => Promise<any[]>
    listUpdatable: () => Promise<any[]>
    updateAll: () => Promise<void>
    checkAria2: () => Promise<{ enabled: boolean }>
    listBuckets: () => Promise<{ name: string; source: string }[]>
    addBucket: (name: string, repo?: string) => Promise<void>
    removeBucket: (name: string) => Promise<void>
    setProxy: (proxy: string) => Promise<void>
    removeProxy: () => Promise<void>
    getEnv: () => Promise<{ scoop: string; global: string }>
    getDiskSpace: () => Promise<any>
    migrateScoop: (newPath: string) => Promise<void>
    onProgress: (callback: (data: ProgressData) => void) => void
    removeProgressListener: () => void
    windowControl: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}
