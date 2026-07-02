import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('scoopAPI', {
  checkScoop: () => ipcRenderer.invoke('scoop:check'),
  installScoop: () => ipcRenderer.invoke('scoop:installScoop'),

  search: (query: string) => ipcRenderer.invoke('scoop:search', query),
  searchRaw: (query: string) => ipcRenderer.invoke('scoop:searchRaw', query),
  fetchPackageInfo: (name: string) => ipcRenderer.invoke('scoop:info', name),
  install: (name: string, options?: { global?: boolean; skipCheck?: boolean; independent?: boolean }) =>
    ipcRenderer.invoke('scoop:install', name, options),
  uninstall: (name: string, global?: boolean) =>
    ipcRenderer.invoke('scoop:uninstall', name, global),
  update: (name?: string) => ipcRenderer.invoke('scoop:update', name),
  cleanup: () => ipcRenderer.invoke('scoop:cleanup'),
  cache: () => ipcRenderer.invoke('scoop:cache'),
  clearCache: () => ipcRenderer.invoke('scoop:clearCache'),
  listInstalled: () => ipcRenderer.invoke('scoop:listInstalled'),
  listUpdatable: () => ipcRenderer.invoke('scoop:listUpdatable'),
  updateAll: () => ipcRenderer.invoke('scoop:updateAll'),
  checkAria2: () => ipcRenderer.invoke('scoop:checkAria2'),
  listBuckets: () => ipcRenderer.invoke('scoop:listBuckets'),
  addBucket: (name: string, repo?: string) => ipcRenderer.invoke('scoop:addBucket', name, repo),
  removeBucket: (name: string) => ipcRenderer.invoke('scoop:removeBucket', name),

  getProxy: () => ipcRenderer.invoke('scoop:getProxy'),
  setProxy: (proxy: string) => ipcRenderer.invoke('scoop:setProxy', proxy),
  removeProxy: () => ipcRenderer.invoke('scoop:removeProxy'),

  getEnv: () => ipcRenderer.invoke('scoop:getEnv'),
  getDiskSpace: () => ipcRenderer.invoke('scoop:diskSpace'),
  migrateScoop: (newPath: string) => ipcRenderer.invoke('scoop:migrate', newPath),
  getScoopVersion: () => ipcRenderer.invoke('scoop:version'),
  getAppIcon: (packageName: string) => ipcRenderer.invoke('scoop:getAppIcon', packageName),
  clearAppIcon: (packageName: string) => ipcRenderer.invoke('scoop:clearAppIcon', packageName),

  onProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('scoop:progress', (_event, data) => callback(data))
  },
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('scoop:progress')
  },

  openExternal: (url: string) => ipcRenderer.invoke('scoop:openExternal', url),

  onLog: (callback: (data: any) => void) => {
    ipcRenderer.on('scoop:log', (_event, data) => callback(data))
  },
  removeLogListener: () => {
    ipcRenderer.removeAllListeners('scoop:log')
  },

  getConfig: (path?: string) => ipcRenderer.invoke('config:get', path),
  setConfig: (path: string, value: any) => ipcRenderer.invoke('config:set', path, value),
  getAllConfig: () => ipcRenderer.invoke('config:getAll'),

  windowControl: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // Self-Update APIs
  checkForUpdate: (url: string) => ipcRenderer.invoke('app:checkForUpdate', url),
  downloadUpdate: (url: string) => ipcRenderer.invoke('app:downloadUpdate', url),
  startAppUpgrade: () => ipcRenderer.invoke('app:startAppUpgrade'),
  onUpdateProgress: (callback: (data: { percent: number }) => void) => {
    ipcRenderer.on('app:updateProgress', (_event, data) => callback(data))
  },
  removeUpdateProgressListener: () => {
    ipcRenderer.removeAllListeners('app:updateProgress')
  },
})
