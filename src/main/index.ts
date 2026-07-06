import { app, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { registerScoopIPC } from './ipc/scoop.js'
import { registerConfigIPC } from './ipc/config.js'
import { registerUpdaterIPC } from './ipc/updater.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function getIconPath(): string | undefined {
  // In dev mode, use the icon from dist/icons/
  // In production, the exe icon is embedded by electron-builder
  const iconPath = join(__dirname, '../icons/icon.ico')
  if (existsSync(iconPath)) {
    return iconPath
  }
  return undefined
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    transparent: false,
    backgroundColor: '#0b0c0e',
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
    titleBarStyle: 'hidden',
    roundedCorners: true,
  })

  // Enable Mica effect on Windows 11
  if (process.platform === 'win32' && typeof mainWindow.setBackgroundMaterial === 'function') {
    try {
      mainWindow.setBackgroundMaterial('mica')
    } catch {
      // Mica not supported, fallback to CSS acrylic
    }
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Window control IPC handlers
function registerWindowIPC(): void {
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize()
  })

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.on('window:close', () => {
    mainWindow?.close()
  })

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow?.isMaximized() ?? false
  })

  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })
}

app.whenReady().then(() => {
  registerWindowIPC()
  registerConfigIPC()
  registerScoopIPC()
  registerUpdaterIPC(() => mainWindow)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
