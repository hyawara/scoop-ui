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
    searchRaw: (query: string) => Promise<string>
    fetchPackageInfo: (name: string) => Promise<{ description?: string; homepage?: string; license?: string; version?: string }>
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
    openExternal: (url: string) => Promise<void>
    getConfig: (path?: string) => Promise<any>
    setConfig: (path: string, value: any) => Promise<boolean>
    getAllConfig: () => Promise<any>
    listBuckets: () => Promise<{ name: string; source: string }[]>
    addBucket: (name: string, repo?: string) => Promise<void>
    removeBucket: (name: string) => Promise<void>
    getProxy: () => Promise<{ enabled: boolean; address: string; type: 'http' | 'socks5' }>
    setProxy: (proxy: string) => Promise<void>
    removeProxy: () => Promise<void>
    getEnv: () => Promise<{ scoop: string; global: string }>
    getScoopVersion: () => Promise<{ version: string }>
    getAppIcon: (packageName: string) => Promise<{ icon: string | null }>
    clearAppIcon: (packageName: string) => Promise<{ success: boolean }>
    getDiskSpace: () => Promise<any>
    migrateScoop: (newPath: string) => Promise<void>
    onProgress: (callback: (data: ProgressData) => void) => void
    removeProgressListener: () => void
    onLog: (callback: (data: ProgressData) => void) => void
    removeLogListener: () => void
    windowControl: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }

    // Self-Update APIs
    checkForUpdate: (url: string) => Promise<{
      hasUpdate: boolean
      version?: string
      notes?: string
      pubDate?: string
      downloadUrl?: string
      error?: string
    }>
    downloadUpdate: (url: string) => Promise<{ success: boolean; path: string }>
    exitAndInstall: () => void
    onUpdateProgress: (callback: (data: { percent: number }) => void) => void
    removeUpdateProgressListener: () => void
  }
}
