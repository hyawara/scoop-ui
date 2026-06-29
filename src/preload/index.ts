import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('scoopAPI', {
  checkScoop: () => ipcRenderer.invoke('scoop:check'),
  installScoop: () => ipcRenderer.invoke('scoop:install'),

  search: (query: string) => ipcRenderer.invoke('scoop:search', query),
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

  setProxy: (proxy: string) => ipcRenderer.invoke('scoop:setProxy', proxy),
  removeProxy: () => ipcRenderer.invoke('scoop:removeProxy'),

  getEnv: () => ipcRenderer.invoke('scoop:getEnv'),
  migrateScoop: (newPath: string) => ipcRenderer.invoke('scoop:migrate', newPath),

  onProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('scoop:progress', (_event, data) => callback(data))
  },
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('scoop:progress')
  },

  windowControl: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
})
