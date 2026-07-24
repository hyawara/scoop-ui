import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('scoopAPI', {
  checkScoop: () => ipcRenderer.invoke('scoop:check'),
  installScoop: (options?: { scoopPath?: string; globalPath?: string }) => ipcRenderer.invoke('scoop:installScoop', options),

  search: (query: string) => ipcRenderer.invoke('scoop:search', query),
  searchRaw: (query: string) => ipcRenderer.invoke('scoop:searchRaw', query),
  searchEngineStatus: (force?: boolean) => ipcRenderer.invoke('scoop:searchEngineStatus', force),
  installSearchEngine: () => ipcRenderer.invoke('scoop:installSearchEngine'),
  // 惰性按需同步：静默 scoop search <app> → 解析全量版本 → 回写 config.appVersionMaps，返回最新数组
  syncAppVersions: (appName: string) => ipcRenderer.invoke('scoop:syncAppVersions', appName),
  // 只读关联版本缓存（秒开用），不触发搜索
  getAppVersions: (appName: string) => ipcRenderer.invoke('scoop:getAppVersions', appName),
  fetchPackageInfo: (name: string) => ipcRenderer.invoke('scoop:info', name),
  checkverLatest: (name: string) => ipcRenderer.invoke('scoop:checkverLatest', name),
  install: (name: string, options?: { global?: boolean; isGlobal?: boolean; useSudo?: boolean; force?: boolean; skipCheck?: boolean; independent?: boolean; noUpdateScoop?: boolean }) =>
    ipcRenderer.invoke('scoop:install', name, options),
  reinstall: (name: string, options?: { global?: boolean; isGlobal?: boolean; useSudo?: boolean }) =>
    ipcRenderer.invoke('scoop:reinstall', { appName: name, ...options }),
  reset: (appName: string) => ipcRenderer.invoke('scoop:reset', appName),
  uninstall: (name: string, global?: boolean, options?: { purge?: boolean }) =>
    ipcRenderer.invoke('scoop:uninstall', name, global, options),
  update: (name?: string | string[], options?: { force?: boolean; global?: boolean; useSudo?: boolean }) => ipcRenderer.invoke('scoop:update', name, options),
  updateSelf: () => ipcRenderer.invoke('scoop:updateSelf'),
  cleanup: () => ipcRenderer.invoke('scoop:cleanup'),
  cache: () => ipcRenderer.invoke('scoop:cache'),
  clearCache: () => ipcRenderer.invoke('scoop:clearCache'),
  listInstalled: () => ipcRenderer.invoke('scoop:listInstalled'),
  getSourceStatus: () => ipcRenderer.invoke('scoop:getSourceStatus'),
  syncSources: (options?: { force?: boolean; reason?: string }) => ipcRenderer.invoke('scoop:syncSources', options),
  checkUpdates: (options?: { syncBuckets?: boolean }) => ipcRenderer.invoke('scoop:check-updates', options),
  listUpdatable: () => ipcRenderer.invoke('scoop:listUpdatable'),
  checkAria2: () => ipcRenderer.invoke('scoop:checkAria2'),
  setAria2Enabled: (enabled: boolean) => ipcRenderer.invoke('scoop:setAria2Enabled', enabled),
  listBuckets: () => ipcRenderer.invoke('scoop:listBuckets'),
  addBucket: (name: string, repo?: string) => ipcRenderer.invoke('scoop:addBucket', name, repo),
  syncBucket: (name: string) => ipcRenderer.invoke('scoop:syncBucket', name),
  updateBucketSource: (name: string, repo: string) => ipcRenderer.invoke('scoop:updateBucketSource', name, repo),
  removeBucket: (name: string) => ipcRenderer.invoke('scoop:removeBucket', name),
  switchMirror: (payload: { mirror: string; prefix?: string }) =>
    ipcRenderer.invoke('scoop:switchMirror', payload),

  getProxy: () => ipcRenderer.invoke('scoop:getProxy'),
  setProxy: (proxy: string) => ipcRenderer.invoke('scoop:setProxy', proxy),
  removeProxy: () => ipcRenderer.invoke('scoop:removeProxy'),

  getEnv: () => ipcRenderer.invoke('scoop:getEnv'),
  getDiskSpace: () => ipcRenderer.invoke('scoop:diskSpace'),
  migrateScoop: (newPath: string) => ipcRenderer.invoke('scoop:migrate', newPath),
  getScoopVersion: () => ipcRenderer.invoke('scoop:version'),
  getScoopConfig: () => ipcRenderer.invoke('scoop:config'),
  setScoopConfig: (key: string, value: string) => ipcRenderer.invoke('scoop:setConfig', key, value),
  getAppIcon: (packageName: string) => ipcRenderer.invoke('scoop:getAppIcon', packageName),
  clearAppIcon: (packageName: string) => ipcRenderer.invoke('scoop:clearAppIcon', packageName),
  getCommandState: () => ipcRenderer.invoke('scoop:getCommandState'),
  isElevated: () => ipcRenderer.invoke('scoop:isElevated'),
  abortCommand: () => ipcRenderer.invoke('scoop:abortCommand'),

  onProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('scoop:progress', (_event, data) => callback(data))
  },
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('scoop:progress')
  },

  exportApps: () => ipcRenderer.invoke('scoop:export'),
  importApps: () => ipcRenderer.invoke('scoop:import'),
  measureOldVersions: () => ipcRenderer.invoke('scoop:measureOldVersions'),

  openExternal: (url: string) => ipcRenderer.invoke('scoop:openExternal', url),
  openPath: (path: string) => ipcRenderer.invoke('scoop:openPath', path),

  onLog: (callback: (data: any) => void) => {
    ipcRenderer.on('scoop:log', (_event, data) => callback(data))
  },
  removeLogListener: () => {
    ipcRenderer.removeAllListeners('scoop:log')
  },

  // 批量命令（spawn）执行完毕信号，用于触发终态数据刷新
  onLogEnd: (callback: (data: any) => void) => {
    ipcRenderer.on('scoop:logEnd', (_event, data) => callback(data))
  },
  removeLogEndListener: () => {
    ipcRenderer.removeAllListeners('scoop:logEnd')
  },
  onCommandState: (callback: (data: any) => void) => {
    ipcRenderer.on('scoop:commandState', (_event, data) => callback(data))
  },
  removeCommandStateListener: () => {
    ipcRenderer.removeAllListeners('scoop:commandState')
  },

  // 内嵌命令执行器 API
  executeCommand: (command: string) => ipcRenderer.invoke('scoop:executeCommand', command),
  onExecuteCommandLog: (callback: (data: { command: string; type: 'stdout' | 'stderr'; content: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { command: string; type: 'stdout' | 'stderr'; content: string }) => callback(data)
    ipcRenderer.on('scoop:executeCommand:log', handler)
    return () => {
      ipcRenderer.removeListener('scoop:executeCommand:log', handler)
    }
  },

  getConfig: (path?: string) => ipcRenderer.invoke('config:get', path),
  setConfig: (path: string, value: any) => ipcRenderer.invoke('config:set', path, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),

  windowControl: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Self-Update APIs (electron-updater)
  checkForUpdate: () => ipcRenderer.invoke('app:checkForUpdate'),
  downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
  quitAndInstall: () => ipcRenderer.invoke('app:quitAndInstall'),
  onUpdateEvent: (callback: (data: any) => void) => {
    ipcRenderer.on('app:updateEvent', (_event, data) => callback(data))
  },
  removeUpdateEventListener: () => {
    ipcRenderer.removeAllListeners('app:updateEvent')
  },
})
