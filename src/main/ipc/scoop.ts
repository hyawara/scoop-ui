import { ipcMain, BrowserWindow } from 'electron'
import { execPowerShell, execScoop, execScoopJSON } from '../utils/powershell'

const SCOOP_INSTALL_SCRIPT = `
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
irm get.scoop.sh | iex
`

export function registerScoopIPC(): void {
  // Check if Scoop is installed
  ipcMain.handle('scoop:check', async () => {
    try {
      const { stdout } = await execPowerShell('where scoop 2>$null; if ($?) { scoop config SCOOP }')
      const lines = stdout.trim().split('\n').filter(Boolean)
      if (lines.length > 0) {
        return { installed: true, path: lines[lines.length - 1]?.trim() }
      }
    } catch {
      // Scoop not found
    }
    return { installed: false }
  })

  // Install Scoop
  ipcMain.handle('scoop:install', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    await execPowerShell(SCOOP_INSTALL_SCRIPT, (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scoop:progress', {
          type: 'message',
          package: 'scoop',
          message: data.trim(),
        })
      }
    })
  })

  // Search packages
  ipcMain.handle('scoop:search', async (_event, query: string) => {
    return execScoopJSON(`search ${query} --json`,)
  })

  // Install a package
  ipcMain.handle('scoop:install', async (event, name: string, options?: { global?: boolean; skipCheck?: boolean; independent?: boolean }) => {
    const args = ['install', name]
    if (options?.global) args.push('--global')
    if (options?.skipCheck) args.push('--skip')
    if (options?.independent) args.push('--independent')

    const win = BrowserWindow.fromWebContents(event.sender)
    return execScoop(args.join(' '), (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scoop:progress', {
          type: 'install',
          package: name,
          message: data.trim(),
        })
      }
    })
  })

  // Uninstall a package
  ipcMain.handle('scoop:uninstall', async (event, name: string, global?: boolean) => {
    const args = `uninstall ${name}${global ? ' --global' : ''}`
    const win = BrowserWindow.fromWebContents(event.sender)
    return execScoop(args, (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scoop:progress', {
          type: 'uninstall',
          package: name,
          message: data.trim(),
        })
      }
    })
  })

  // Update packages
  ipcMain.handle('scoop:update', async (event, name?: string) => {
    const args = name ? `update ${name}` : 'update --all'
    const win = BrowserWindow.fromWebContents(event.sender)
    return execScoop(args, (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scoop:progress', {
          type: 'update',
          package: name || '*',
          message: data.trim(),
        })
      }
    })
  })

  // Cleanup old versions
  ipcMain.handle('scoop:cleanup', async () => {
    return execScoop('cleanup --all')
  })

  // Get cache info
  ipcMain.handle('scoop:cache', async () => {
    const { stdout } = await execScoop('cache show')
    const lines = stdout.trim().split('\n').filter(Boolean)
    return { size: 0, files: lines.length }
  })

  // Clear cache
  ipcMain.handle('scoop:clearCache', async () => {
    return execScoop('cache rm *')
  })

  // List installed packages
  ipcMain.handle('scoop:listInstalled', async () => {
    return execScoopJSON('list --json')
  })

  // List updatable packages
  ipcMain.handle('scoop:listUpdatable', async () => {
    return execScoopJSON('status --json')
  })

  // Set proxy
  ipcMain.handle('scoop:setProxy', async (_event, proxy: string) => {
    return execScoop(`config proxy ${proxy}`)
  })

  // Remove proxy
  ipcMain.handle('scoop:removeProxy', async () => {
    return execScoop('config rm proxy')
  })

  // Get scoop environment
  ipcMain.handle('scoop:getEnv', async () => {
    const { stdout } = await execPowerShell('echo "SCOOP=$env:SCOOP; GLOBAL=$env:SCOOP_GLOBAL"')
    const scoop = stdout.match(/SCOOP=(.+)/)?.[1]?.trim() || ''
    const global = stdout.match(/GLOBAL=(.+)/)?.[1]?.trim() || ''
    return { scoop, global }
  })

  // Migrate scoop directory
  ipcMain.handle('scoop:migrate', async (event, newPath: string) => {
    const { scoop } = await (ipcMain as any).emit('scoop:getEnv') || { scoop: '' }
    if (scoop) {
      const win = BrowserWindow.fromWebContents(event.sender)
      await execPowerShell(
        `Copy-Item -Path "${scoop}" -Destination "${newPath}" -Recurse -Force; [Environment]::SetEnvironmentVariable('SCOOP', '${newPath}', 'User')`,
        (data) => {
          if (win && !win.isDestroyed()) {
            win.webContents.send('scoop:progress', {
              type: 'message',
              package: 'scoop',
              message: data.trim(),
            })
          }
        }
      )
    }
  })
}
