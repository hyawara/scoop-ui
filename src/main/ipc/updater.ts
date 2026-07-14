import { ipcMain, BrowserWindow, app } from 'electron'
import electronUpdater, { type UpdateInfo, type ProgressInfo } from 'electron-updater'

// electron-updater 是 CJS 包，在 ESM 下必须 default import 再解构，
// 具名导入 { autoUpdater } 在运行时会得到 undefined。
const { autoUpdater } = electronUpdater

/**
 * 统一推给渲染端的更新事件。渲染端只需监听一个 channel，
 * 按 status 字段驱动 UI 状态机。
 */
type UpdateEvent =
  | { status: 'checking' }
  | { status: 'available'; version: string; notes: string; releaseDate: string; size: number }
  | { status: 'not-available'; version: string }
  | { status: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string; notes: string; releaseDate: string; size: number }
  | { status: 'error'; message: string }

type CheckUpdateResult = {
  hasUpdate: boolean
  version?: string
  notes?: string
  releaseDate?: string
  size?: number
  devMode?: boolean
  error?: string
}

type DownloadUpdateResult = {
  success: boolean
  error?: string
}

/**
 * 从 UpdateInfo.files 中取安装包的真实字节数。
 * electron-updater 的 files 数组通常首项即主安装包，取其 size。
 * 拿不到时回退 0，交给渲染端决定是否展示体积。
 */
function pickPackageSize(info: UpdateInfo): number {
  const files = info.files
  if (Array.isArray(files) && files.length > 0) {
    const primary = files.find(f => typeof f.size === 'number' && f.size > 0) || files[0]
    if (primary && typeof primary.size === 'number') return primary.size
  }
  return 0
}

function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'note' in item && typeof item.note === 'string') return item.note
        return ''
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return ''
}

function normalizeProgress(progress: ProgressInfo): Extract<UpdateEvent, { status: 'progress' }> {
  const total = Number.isFinite(progress.total) ? Math.max(0, progress.total) : 0
  const transferred = Number.isFinite(progress.transferred) ? Math.max(0, progress.transferred) : 0
  const rawPercent = Number.isFinite(progress.percent)
    ? progress.percent
    : total > 0
      ? (transferred / total) * 100
      : 0

  return {
    status: 'progress',
    percent: Math.max(0, Math.min(100, Math.round(rawPercent))),
    transferred,
    total,
    bytesPerSecond: Number.isFinite(progress.bytesPerSecond) ? Math.max(0, progress.bytesPerSecond) : 0,
  }
}

/**
 * 注册 electron-updater 及其 IPC。
 *
 * 更新闭环：
 *   1. 渲染端调用 app:checkForUpdate → autoUpdater.checkForUpdates()
 *   2. 命中新版本 → 推送 'available'（不自动下载，交给用户决定）
 *   3. 渲染端调用 app:downloadUpdate → autoUpdater.downloadUpdate()
 *      → 差分下载，持续推送 'progress'
 *   4. 下载完成 → 推送 'downloaded'
 *   5. 渲染端调用 app:quitAndInstall → 退出并静默安装 NSIS 差分包后自动重启
 *
 * @param getWindow 返回当前主窗口的函数（窗口可能被重建，所以用 getter）
 */
export function registerUpdaterIPC(getWindow: () => BrowserWindow | null): void {
  // 由渲染端显式触发下载，给用户"先看更新日志再决定"的空间
  autoUpdater.autoDownload = false
  // 应用退出时若已下载则自动安装（兜底）
  autoUpdater.autoInstallOnAppQuit = true
  // 允许降级（回滚场景）
  autoUpdater.allowDowngrade = false

  let checkUpdateTask: Promise<CheckUpdateResult> | null = null
  let downloadUpdateTask: Promise<DownloadUpdateResult> | null = null

  function send(event: UpdateEvent): void {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:updateEvent', event)
    }
  }

  function sendError(message: string): void {
    console.error('[updater]', message)
    send({ status: 'error', message })
  }

  function toCheckResult(info: UpdateInfo): CheckUpdateResult {
    const remote = info.version
    const current = app.getVersion()
    return {
      hasUpdate: remote !== current,
      version: remote,
      notes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate || '',
      size: pickPackageSize(info),
    }
  }

  autoUpdater.on('checking-for-update', () => {
    send({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send({
      status: 'available',
      version: info.version,
      notes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate || '',
      size: pickPackageSize(info),
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    send({ status: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    send(normalizeProgress(p))
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    send({
      status: 'downloaded',
      version: info.version,
      notes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate || '',
      size: pickPackageSize(info),
    })
  })

  autoUpdater.on('error', (err: Error) => {
    sendError(err?.message || String(err))
  })

  // ── IPC：检查更新 ──
  // 返回结构化结果，方便渲染端 await 拿到即时反馈；
  // 事件流（checking/available/...）同时会通过 app:updateEvent 推送。
  ipcMain.handle('app:checkForUpdate', async (): Promise<CheckUpdateResult> => {
    if (!app.isPackaged) {
      // 开发模式没有 latest.yml，但通过正常事件流反馈给 UI
      send({ status: 'not-available', version: app.getVersion() })
      return { hasUpdate: false, devMode: true, version: app.getVersion() }
    }

    // checkForUpdates 不是可重入操作；重复点击或启动检查撞上手动检查时共用同一个 Promise。
    if (checkUpdateTask) return checkUpdateTask

    checkUpdateTask = (async () => {
      try {
        const result = await autoUpdater.checkForUpdates()
        if (!result) return { hasUpdate: false }
        return toCheckResult(result.updateInfo)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        sendError(message)
        return { hasUpdate: false, error: message }
      } finally {
        checkUpdateTask = null
      }
    })()

    return checkUpdateTask
  })

  // ── IPC：开始下载（差分）──
  ipcMain.handle('app:downloadUpdate', async (): Promise<DownloadUpdateResult> => {
    if (!app.isPackaged) {
      const message = '开发模式不支持下载应用更新'
      sendError(message)
      return { success: false, error: message }
    }

    // 下载是最不能并发的环节：重复执行可能污染缓存、造成校验失败或让 UI 状态互相覆盖。
    if (downloadUpdateTask) return downloadUpdateTask

    downloadUpdateTask = (async () => {
      try {
        await autoUpdater.downloadUpdate()
        return { success: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        sendError(message)
        return { success: false, error: message }
      } finally {
        downloadUpdateTask = null
      }
    })()

    return downloadUpdateTask
  })

  // ── IPC：退出并安装（触发重启）──
  // 交给 electron-updater 传递 --updated / --force-run。
  // installer.nsh 会在更新时沿用既有安装范围，并跳过安装对象和安装目录等向导页。
  ipcMain.handle('app:quitAndInstall', () => {
    setImmediate(() => {
      try {
        autoUpdater.quitAndInstall(false, true)
      } catch (e) {
        sendError(e instanceof Error ? e.message : String(e))
      }
    })
    return { success: true }
  })
}
