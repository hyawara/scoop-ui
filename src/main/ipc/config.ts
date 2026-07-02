import { ipcMain } from 'electron'
import { getConfigPath, setConfigPath, readConfig } from '../utils/config.js'

export function registerConfigIPC(): void {
  ipcMain.handle('config:get', async (_event, path?: string) => {
    return getConfigPath(path)
  })

  ipcMain.handle('config:set', async (_event, path: string, value: any) => {
    setConfigPath(path, value)
    return true
  })

  ipcMain.handle('config:getAll', async () => {
    return readConfig()
  })
}
