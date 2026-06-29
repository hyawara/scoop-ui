import { ipcMain, BrowserWindow } from 'electron'
import { execPowerShell, execScoop, execScoopJSON } from '../utils/powershell.js'

const SCOOP_INSTALL_SCRIPT = `
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
irm get.scoop.sh | iex
`

export function registerScoopIPC(): void {
  // Check if Scoop is installed
  ipcMain.handle('scoop:check', async () => {
    const { stdout } = await execPowerShell(`
      $scoopPath = $null
      # 1. Check SCOOP environment variable
      if ($env:SCOOP) {
        $scoopPath = $env:SCOOP
      }
      # 2. Check if scoop command is in PATH
      if (-not $scoopPath) {
        $cmd = Get-Command scoop -ErrorAction SilentlyContinue
        if ($cmd) {
          $scoopPath = Split-Path -Parent (Split-Path -Parent $cmd.Source)
        }
      }
      # 3. Check default install location
      if (-not $scoopPath) {
        $defaultPath = Join-Path $env:USERPROFILE 'scoop'
        if (Test-Path (Join-Path $defaultPath 'shims' 'scoop.ps1')) {
          $scoopPath = $defaultPath
        }
      }
      # 4. Check USERPROFILE subdirectories for scoop shims
      if (-not $scoopPath) {
        $possible = Get-ChildItem -Path $env:USERPROFILE -Directory -ErrorAction SilentlyContinue | Where-Object {
          Test-Path (Join-Path $_.FullName 'scoop' 'shims' 'scoop.ps1')
        } | Select-Object -First 1
        if ($possible) {
          $scoopPath = Join-Path $possible.FullName 'scoop'
        }
      }
      if ($scoopPath) {
        Write-Output "INSTALLED:$scoopPath"
      } else {
        Write-Output "NOT_INSTALLED"
      }
    `)
    const match = stdout.match(/INSTALLED:(.+)/)
    if (match) {
      return { installed: true, path: match[1].trim() }
    }
    return { installed: false }
  })

  // Install Scoop (bootstrap)
  ipcMain.handle('scoop:installScoop', async (event) => {
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
    if (!/^[a-zA-Z0-9._\- ]{1,100}$/.test(query)) {
      throw new Error('Invalid search query')
    }
    const { stdout } = await execScoop(`search ${query}`)
    const lines = stdout.split('\n')
    const result: { name: string; version: string; description: string; bucket: string }[] = []
    let inTable = false
    for (const line of lines) {
      if (!inTable) {
        if (/^----/.test(line.trim())) { inTable = true }
        continue
      }
      const m = line.match(/^(\S[\w.\-+]+)\s+(\S+)(?:\s+([^\s]+))?\s*(.*)$/)
      if (m && m[1].length > 0) {
        result.push({ name: m[1], version: m[2] || '', bucket: m[3] || '', description: (m[4] || '').trim() })
      }
    }
    return result
  })

  // Install a package
  ipcMain.handle('scoop:install', async (event, name: string, options?: { global?: boolean; skipCheck?: boolean; independent?: boolean }) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-]{0,100}$/.test(name)) {
      throw new Error('Invalid package name')
    }
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
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-]{0,100}$/.test(name)) {
      throw new Error('Invalid package name')
    }
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
  ipcMain.handle('scoop:cleanup', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return execScoop('cleanup --all', (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scoop:progress', {
          type: 'message',
          package: 'scoop',
          message: data.trim(),
        })
      }
    })
  })

  // Get cache info
  ipcMain.handle('scoop:cache', async () => {
    const { stdout } = await execScoop('cache show')
    const lines = stdout.trim().split('\n').filter(Boolean)
    let totalSize = 0
    for (const line of lines) {
      const m = line.match(/(\d+[\d.]*)\s*(KB|MB|GB|B)/i)
      if (m) {
        let size = parseFloat(m[1])
        const unit = m[2].toUpperCase()
        if (unit === 'KB') size *= 1024
        else if (unit === 'MB') size *= 1024 * 1024
        else if (unit === 'GB') size *= 1024 * 1024 * 1024
        totalSize += size
      }
    }
    return { size: Math.round(totalSize / (1024 * 1024) * 100) / 100, files: lines.length }
  })

  // Clear cache
  ipcMain.handle('scoop:clearCache', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return execScoop('cache rm *', (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scoop:progress', {
          type: 'message',
          package: 'scoop',
          message: data.trim(),
        })
      }
    })
  })

  // List installed packages
  ipcMain.handle('scoop:listInstalled', async () => {
    const { stdout } = await execScoop('list')
    const lines = stdout.split('\n')
    const result: { name: string; version: string; bucket: string }[] = []
    for (const line of lines) {
      const m = line.match(/^\s{2}(\S[\w.\-+]+)\s+(\S+)(?:\s+\[(\w+)\])?/)
      if (m) {
        result.push({ name: m[1], version: m[2], bucket: m[3] || '' })
      }
    }
    return result
  })

  // List updatable packages
  ipcMain.handle('scoop:listUpdatable', async () => {
    const { stdout } = await execScoop('status')
    const lines = stdout.split('\n')
    const result: { name: string; oldVersion: string; newVersion: string }[] = []
    for (const line of lines) {
      const m = line.match(/^\s{2}(\S[\w.\-+]+):\s+(\S+)\s+->\s+(\S+)/)
      if (m) {
        result.push({ name: m[1], oldVersion: m[2], newVersion: m[3] })
      }
    }
    return result
  })

  // Set proxy
  ipcMain.handle('scoop:setProxy', async (_event, proxy: string) => {
    if (!/^[\w.\-:]{1,200}$/.test(proxy) && !/^socks5:\/\/[\w.\-:]{1,200}$/.test(proxy)) {
      throw new Error('Invalid proxy address')
    }
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

  // Get disk space for scoop directories
  ipcMain.handle('scoop:diskSpace', async () => {
    const { stdout } = await execPowerShell(
      'Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null } | Select-Object Name, Used, Free | ConvertTo-Json -Compress'
    )
    try {
      return JSON.parse(stdout.trim().split('\n').pop() || '{}')
    } catch {
      return {}
    }
  })

  // Migrate scoop directory
  ipcMain.handle('scoop:migrate', async (event, newPath: string) => {
    if (!/^[a-zA-Z]:\\[^<>:"|?*]{1,200}$/.test(newPath)) {
      throw new Error('Invalid directory path')
    }
    const { stdout } = await execPowerShell('echo $env:SCOOP')
    const scoop = stdout.trim()
    if (scoop) {
      const win = BrowserWindow.fromWebContents(event.sender)
      // PowerShell -Command with single-quoted paths to prevent injection
      await execPowerShell(
        `Copy-Item -Path $env:SCOOP -Destination '${newPath.replace(/'/g, "''")}' -Recurse -Force; [Environment]::SetEnvironmentVariable('SCOOP', '${newPath.replace(/'/g, "''")}', 'User')`,
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
