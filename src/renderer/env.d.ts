/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
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
    setProxy: (proxy: string) => Promise<void>
    removeProxy: () => Promise<void>
    getEnv: () => Promise<{ scoop: string; global: string }>
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
