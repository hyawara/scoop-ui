import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { registerScoopIPC } from './ipc/scoop.js'
import { registerConfigIPC } from './ipc/config.js'
import { registerUpdaterIPC } from './ipc/updater.js'

// 静默 Node.js v22+ 内部 DEP0180 (fs.Stats constructor) 的无害警告
process.on('warning', (warning) => {
  if ((warning as any).code === 'DEP0180') return
  console.warn(warning)
})

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

  // 拦截所有 window.open / target="_blank" / a[href] 触发的新窗口请求：
  // - http(s) 协议一律交由系统默认浏览器打开，杜绝弹出内嵌 BrowserWindow
  // - 其他协议（file://、javascript:、about: 等）一律 deny，避免协议逃逸
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) {
      shell.openExternal(details.url).catch(() => { /* 静默失败 */ })
    }
    return { action: 'deny' }
  })

  // 双保险：拦截主 frame 内的顶层导航（例如 <a> 未设 target 但被点击时）
  // 若目标是 http(s) 外链，则阻止内嵌加载并交由系统浏览器打开
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!mainWindow) return
    const currentUrl = mainWindow.webContents.getURL()
    // 允许开发环境 HMR / 应用自身的路由跳转，仅拦截跨源 http(s)
    if (/^https?:\/\//i.test(url) && !url.startsWith(currentUrl)) {
      event.preventDefault()
      shell.openExternal(url).catch(() => { /* 静默失败 */ })
    }
  })

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
