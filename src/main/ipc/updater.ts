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
  | { status: 'available'; version: string; notes: string; releaseDate: string }
  | { status: 'not-available'; version: string }
  | { status: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string; notes: string; releaseDate: string }
  | { status: 'error'; message: string }

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

  function send(event: UpdateEvent): void {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('app:updateEvent', event)
    }
  }

  autoUpdater.on('checking-for-update', () => {
    send({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send({
      status: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
      releaseDate: info.releaseDate || '',
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    send({ status: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    send({
      status: 'progress',
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    send({
      status: 'downloaded',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
      releaseDate: info.releaseDate || '',
    })
  })

  autoUpdater.on('error', (err: Error) => {
    console.error('[updater]', err)
    send({ status: 'error', message: err?.message || String(err) })
  })

  // ── IPC：检查更新 ──
  // 返回结构化结果，方便渲染端 await 拿到即时反馈；
  // 事件流（checking/available/...）同时会通过 app:updateEvent 推送。
  ipcMain.handle('app:checkForUpdate', async () => {
    if (!app.isPackaged) {
      // 开发模式没有 latest.yml，直接短路，避免报错刷屏
      return { hasUpdate: false, devMode: true }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) return { hasUpdate: false }
      const remote = result.updateInfo.version
      const current = app.getVersion()
      const hasUpdate = remote !== current
      return {
        hasUpdate,
        version: remote,
        notes: typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : '',
        releaseDate: result.updateInfo.releaseDate || '',
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { hasUpdate: false, error: message }
    }
  })

  // ── IPC：开始下载（差分）──
  ipcMain.handle('app:downloadUpdate', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      send({ status: 'error', message })
      return { success: false, error: message }
    }
  })

  // ── IPC：退出并安装（触发重启）──
  ipcMain.handle('app:quitAndInstall', () => {
    // isSilent=false 显示安装进度；isForceRunAfter=true 安装后自动拉起应用
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  })
}
