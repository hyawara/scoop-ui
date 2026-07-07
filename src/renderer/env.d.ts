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

// Scoop 包更新结果（与 src/main/ipc/scoop.ts 的 scoop:update handler 返回值保持一致）
// 后端不再 throw，而是返回结构化结果对象，携带版本双重校验信息，杜绝"伪成功"
interface UpdateResult {
  success: boolean
  package: string
  code?: number
  localVersion?: string
  expectedVersion?: string
  error?: string
  verifyError?: string
}

// 主进程 electron-updater 统一推送的更新事件（与 src/main/ipc/updater.ts 保持一致）
type UpdateEvent =
  | { status: 'checking' }
  | { status: 'available'; version: string; notes: string; releaseDate: string; size: number }
  | { status: 'not-available'; version: string }
  | { status: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string; notes: string; releaseDate: string; size: number }
  | { status: 'error'; message: string }

interface Window {
  scoopAPI: {
    checkScoop: () => Promise<{ installed: boolean; path?: string }>
    installScoop: (options?: { scoopPath?: string; globalPath?: string }) => Promise<void>
    search: (query: string) => Promise<{ name: string; version: string; description: string; bucket: string }[]>
    searchRaw: (query: string) => Promise<string>
    fetchPackageInfo: (name: string) => Promise<{ description?: string; homepage?: string; license?: string; version?: string }>
    install: (name: string, options?: InstallOptions) => Promise<void>
    uninstall: (name: string, global?: boolean) => Promise<void>
    update: (name?: string) => Promise<UpdateResult>
    cleanup: () => Promise<{ released: number }>
    cache: () => Promise<{ size: number; unit: string; files: number }>
    clearCache: () => Promise<void>
    listInstalled: () => Promise<{ name: string; version: string; bucket: string; global: boolean }[]>
    listUpdatable: () => Promise<{ name: string; oldVersion: string; newVersion: string }[]>
    checkAria2: () => Promise<{ installed: boolean; enabled: boolean }>
    setAria2Enabled: (enabled: boolean) => Promise<{ success: boolean }>
    switchMirror: (payload: { mirror: string; prefix?: string }) => Promise<{
      success: boolean
      mirror: string
      switched: number
      total: number
      results: { bucket: string; ok: boolean; url?: string; error?: string }[]
      aria2WasEnabled: boolean
      aria2Restored: boolean
      error?: string
    }>
    openExternal: (url: string) => Promise<void>
    openPath: (path: string) => Promise<void>
    getConfig: (path?: string) => Promise<any>
    setConfig: (path: string, value: any) => Promise<boolean>
    getAllConfig: () => Promise<any>
    listBuckets: () => Promise<{ name: string; source: string; localPath: string; appCount: number; lastUpdated: string }[]>
    addBucket: (name: string, repo?: string) => Promise<void>
    removeBucket: (name: string) => Promise<void>
    getProxy: () => Promise<{ enabled: boolean; address: string; type: 'http' | 'socks5' }>
    setProxy: (proxy: string) => Promise<void>
    removeProxy: () => Promise<void>
    getEnv: () => Promise<{ scoop: string; global: string }>
    getScoopVersion: () => Promise<{ version: string }>
    getScoopConfig: () => Promise<Record<string, string>>
    setScoopConfig: (key: string, value: string) => Promise<void>
    exportApps: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>
    importApps: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>
    measureOldVersions: () => Promise<{ bytes: number }>

    getAppIcon: (packageName: string) => Promise<{ icon: string | null }>
    clearAppIcon: (packageName: string) => Promise<{ success: boolean }>
    getDiskSpace: () => Promise<any>
    migrateScoop: (newPath: string) => Promise<void>
    onProgress: (callback: (data: ProgressData) => void) => void
    removeProgressListener: () => void
    onLog: (callback: (data: ProgressData) => void) => void
    removeLogListener: () => void

    // 内嵌命令执行器 API
    executeCommand: (command: string) => Promise<{ success: boolean }>
    onExecuteCommandLog: (callback: (data: { command: string; type: 'stdout' | 'stderr'; content: string }) => void) => () => void

    windowControl: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }

    getAppVersion: () => Promise<string>

    // Self-Update APIs (electron-updater)
    checkForUpdate: () => Promise<{
      hasUpdate: boolean
      version?: string
      notes?: string
      releaseDate?: string
      error?: string
      devMode?: boolean
    }>
    downloadUpdate: () => Promise<{ success: boolean; error?: string }>
    quitAndInstall: (options?: { isUpdate?: boolean }) => Promise<void>
    onUpdateEvent: (callback: (data: UpdateEvent) => void) => void
    removeUpdateEventListener: () => void
  }
}
