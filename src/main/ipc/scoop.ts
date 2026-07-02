import { ipcMain, BrowserWindow, shell, app } from 'electron'
import { execPowerShell, execGitBash, execScoop, execScoopJSON } from '../utils/powershell.js'
import { homedir, tmpdir } from 'os'
import { join, basename } from 'path'
import { createWriteStream, existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { pipeline } from 'stream/promises'
import { execSync, spawn } from 'child_process'

function sendProgress(win: BrowserWindow | null, data: any) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scoop:progress', data)
    win.webContents.send('scoop:log', data)
  }
}

const SCOOP_INSTALL_SCRIPT = `
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
irm get.scoop.sh | iex
scoop install git
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
        sendProgress(win, {
          type: 'message',
          package: 'scoop',
          message: data.trim(),
        })
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
        if (/^-{3,}/.test(line.trim())) { inTable = true }
        continue
      }
      // 跳过空行和汇总行（如 "Results from local buckets..."）
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('Results') || trimmed.startsWith('No results')) continue
      // scoop search 输出格式: name  version  [bucket]  description
      const m = trimmed.match(/^([\w.\-+]+)\s+(\S+)\s+(\S+)\s*(.*)$/)
      if (m && m[1].length > 0) {
        result.push({ name: m[1], version: m[2] || '', bucket: m[3] || '', description: (m[4] || '').trim() })
      }
    }
    return result
  })

  // Fetch package info (manifest) via scoop cat
  ipcMain.handle('scoop:info', async (_event, name: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-]{0,100}$/.test(name)) {
      throw new Error('Invalid package name')
    }
    try {
      return await execScoopJSON<{ description?: string; homepage?: string; license?: string; version?: string }>(`cat ${name}`)
    } catch {
      return { description: '' }
    }
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
        sendProgress(win, {
          type: 'install',
          package: name,
          message: data.trim(),
        })
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
        sendProgress(win, {
          type: 'uninstall',
          package: name,
          message: data.trim(),
        })
    })
  })

  // Update packages
  ipcMain.handle('scoop:update', async (event, name?: string) => {
    const args = name ? `update ${name}` : 'update --all'
    const win = BrowserWindow.fromWebContents(event.sender)
    return execScoop(args, (data) => {
        sendProgress(win, {
          type: 'update',
          package: name || '*',
          message: data.trim(),
        })
    })
  })

  // Cleanup old versions
  ipcMain.handle('scoop:cleanup', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return execScoop('cleanup --all', (data) => {
        sendProgress(win, {
          type: 'message',
          package: 'scoop',
          message: data.trim(),
        })
    })
  })

  // Get cache info
  ipcMain.handle('scoop:cache', async () => {
    const { stdout } = await execScoop('cache show', undefined, undefined, homedir())
    // 直接解析 "Total: X file(s), Y MB" 汇总行
    const totalMatch = stdout.match(/Total:\s*(\d+)\s*files?,\s*([\d.]+)\s*(KB|MB|GB|B)/i)
    if (totalMatch) {
      const files = parseInt(totalMatch[1])
      let size = parseFloat(totalMatch[2])
      const unit = totalMatch[3].toUpperCase()
      if (unit === 'KB') size *= 1024
      else if (unit === 'MB') size *= 1024 * 1024
      else if (unit === 'GB') size *= 1024 * 1024 * 1024
      return { size: Math.round(size / (1024 * 1024) * 100) / 100, files }
    }
    return { size: 0, files: 0 }
  })

  // Clear cache
  ipcMain.handle('scoop:clearCache', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { stdout, stderr, code } = await execScoop('cache rm --all', (data) => {
        sendProgress(win, {
          type: 'message',
          package: 'scoop',
          message: data.trim(),
        })
    }, undefined, homedir())
    if (code !== 0) {
      throw new Error(stderr || '清除缓存失败')
    }
    return { success: true, message: stdout.trim() }
  })

  // List installed packages (scoop list outputs fixed-width table: Name, Version, Source, Updated, Info)
  ipcMain.handle('scoop:listInstalled', async () => {
    const { stdout } = await execScoop('list')
    const lines = stdout.split('\n')
    const result: { name: string; version: string; bucket: string; global: boolean }[] = []
    let pastHeader = false

    // Get globally installed packages for cross-reference
    let globalSet = new Set<string>()
    try {
      const g = await execScoop('list --global')
      for (const l of g.stdout.split('\n')) {
        const parts = l.trim().split(/\s{2,}/)
        if (parts[0] && !parts[0].startsWith('-') && !parts[0].startsWith('Name')) {
          globalSet.add(parts[0].trim())
        }
      }
    } catch { /* no global packages */ }

    for (const line of lines) {
      if (!pastHeader) {
        if (/^-+\s+-+/.test(line)) { pastHeader = true }
        continue
      }
      const fields = line.trim().split(/\s{2,}/)
      if (fields.length >= 2 && fields[0] && fields[1]) {
        result.push({
          name: fields[0].trim(),
          version: fields[1].trim(),
          bucket: fields[2]?.trim() || '',
          global: globalSet.has(fields[0].trim()),
        })
      }
    }
    return result
  })

  // List updatable packages (scoop status: Name, Installed Version, Latest Version, ...)
  ipcMain.handle('scoop:listUpdatable', async () => {
    const { stdout } = await execScoop('status')
    const lines = stdout.split('\n')
    const result: { name: string; oldVersion: string; newVersion: string }[] = []
    let pastHeader = false
    for (const line of lines) {
      if (!pastHeader) {
        if (/^-+\s+-+/.test(line)) { pastHeader = true }
        continue
      }
      const fields = line.trim().split(/\s{2,}/)
      if (fields.length >= 3 && fields[0] && fields[1] && fields[2]) {
        result.push({ name: fields[0].trim(), oldVersion: fields[1].trim(), newVersion: fields[2].trim() })
      }
    }
    return result
  })

  // Update all packages
  ipcMain.handle('scoop:updateAll', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return execScoop('update --all', (data) => {
        sendProgress(win, {
          type: 'update', package: '*', message: data.trim(),
        })
    })
  })

  // Get Scoop version
  ipcMain.handle('scoop:version', async () => {
    const { stdout } = await execScoop('--version')
    const versionMatch = stdout.match(/(?:Current Scoop version|Scoop version)[:\s]*\*?\s*([a-f0-9]+)/i)
    const rawVersion = versionMatch ? versionMatch[1] : stdout.trim().split('\n')[0]?.trim() || ''
    return { version: rawVersion }
  })

  // ============================================
  // App Icon: Extract + disk cache via git-bash
  // ============================================
  const ICON_CACHE_DIR = join(homedir(), '.scoop-ui', 'icons')
  const iconMemoryCache = new Map<string, string | null>() // packageName -> base64 or null

  // 确保缓存目录存在
  try { mkdirSync(ICON_CACHE_DIR, { recursive: true }) } catch { /* exists */ }

  /**
   * 通过 git-bash 调用 PowerShell 提取 EXE 图标，结果缓存到磁盘
   * 缓存策略：首次提取后持久化，仅在 update 时清除对应缓存
   */
  ipcMain.handle('scoop:getAppIcon', async (_event, packageName: string) => {
    // 1. 内存缓存
    if (iconMemoryCache.has(packageName)) {
      return { icon: iconMemoryCache.get(packageName) }
    }

    // 2. 磁盘缓存
    const cacheFile = join(ICON_CACHE_DIR, `${packageName}.png`)
    if (existsSync(cacheFile)) {
      try {
        const base64 = readFileSync(cacheFile).toString('base64')
        const dataUrl = `data:image/png;base64,${base64}`
        iconMemoryCache.set(packageName, dataUrl)
        return { icon: dataUrl }
      } catch { /* read error, re-extract */ }
    }

    try {
      // 3. 查找 scoop 应用目录
      const scoopPath = process.env['SCOOP'] || join(homedir(), 'scoop')
      const appDir = join(scoopPath, 'apps', packageName, 'current')
      if (!existsSync(appDir)) {
        iconMemoryCache.set(packageName, null)
        return { icon: null }
      }

      // 4. 读 manifest.json 定位主 EXE
      const manifestPath = join(appDir, 'manifest.json')
      let mainExe = ''

      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

          // shortcuts 优先: [["Obsidian.exe", "Obsidian"]]
          if (manifest.shortcuts?.length > 0) {
            mainExe = manifest.shortcuts[0][0]
          }

          // bin 字段
          if (!mainExe && manifest.bin) {
            const bin = Array.isArray(manifest.bin) ? manifest.bin[0] : manifest.bin
            mainExe = typeof bin === 'string' ? bin : bin?.exe || ''
          }

          // architecture -> bin
          if (!mainExe && manifest.architecture) {
            const arch = manifest.architecture['64bit'] || manifest.architecture['32bit'] || Object.values(manifest.architecture)[0]
            if (arch?.bin) {
              const bin = Array.isArray(arch.bin) ? arch.bin[0] : arch.bin
              mainExe = typeof bin === 'string' ? bin : bin?.exe || ''
            }
          }
        } catch { /* parse error */ }
      }

      // 5. 兜底：扫描 .exe
      if (!mainExe) {
        const { stdout } = await execGitBash(
          `find "${appDir}" -maxdepth 2 -name "*.exe" -type f | head -1`
        )
        mainExe = stdout.trim()
      }

      if (!mainExe) {
        iconMemoryCache.set(packageName, null)
        return { icon: null }
      }

      // 解析完整路径
      const fullPath = mainExe.includes(':') ? mainExe : join(appDir, mainExe)
      if (!existsSync(fullPath)) {
        iconMemoryCache.set(packageName, null)
        return { icon: null }
      }

      // 6. 通过 git-bash 调用 PowerShell 提取图标
      const psScript = [
        'Add-Type -AssemblyName System.Drawing',
        `$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${fullPath.replace(/'/g, "''")}')`,
        'if ($icon) {',
        '  $ms = New-Object System.IO.MemoryStream',
        '  $icon.ToBmp().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
        '  $bytes = $ms.ToArray()',
        '  [Convert]::ToBase64String($bytes)',
        '  $ms.Dispose()',
        '  $icon.Dispose()',
        '}',
      ].join('\r\n')

      const { stdout } = await execGitBash(`powershell.exe -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"').replace(/\r\n/g, '; ')}"`)
      const base64 = stdout.trim()

      if (base64 && base64.length > 100) {
        // 写入磁盘缓存
        try {
          const buffer = Buffer.from(base64, 'base64')
          writeFileSync(cacheFile, buffer)
        } catch { /* write error, non-critical */ }

        const dataUrl = `data:image/png;base64,${base64}`
        iconMemoryCache.set(packageName, dataUrl)
        return { icon: dataUrl }
      }

      iconMemoryCache.set(packageName, null)
      return { icon: null }
    } catch {
      iconMemoryCache.set(packageName, null)
      return { icon: null }
    }
  })

  /**
   * 清除指定包的图标缓存（更新时调用）
   */
  ipcMain.handle('scoop:clearAppIcon', async (_event, packageName: string) => {
    iconMemoryCache.delete(packageName)
    const cacheFile = join(ICON_CACHE_DIR, `${packageName}.png`)
    try { unlinkSync(cacheFile) } catch { /* not exists */ }
    return { success: true }
  })

  // Check Aria2 status (check both config flag and actual binary presence)
  ipcMain.handle('scoop:checkAria2', async () => {
    // Check if aria2 is actually installed on the system via scoop list
    let installed = false
    try {
      const { stdout } = await execScoop('list aria2')
      // scoop list aria2 outputs lines if installed; if not installed, output says "Couldn't find manifest for 'aria2'"
      installed = stdout.trim().length > 0
        && !stdout.toLowerCase().includes("couldn't find")
        && !stdout.toLowerCase().includes('is not installed')
        && !stdout.toLowerCase().includes('no results')
    } catch { /* not installed */ }

    // Also check the scoop config flag
    let enabled = false
    try {
      const { stdout } = await execScoop('config aria2-enabled')
      enabled = stdout.trim().toLowerCase() === 'true'
    } catch { /* config not set */ }

    return { enabled: installed || enabled }
  })

  // List buckets
  ipcMain.handle('scoop:listBuckets', async () => {
    const { stdout } = await execScoop('bucket list')
    const lines = stdout.split('\n')
    const items: { name: string; source: string }[] = []
    let pastHeader = false
    for (const line of lines) {
      if (!pastHeader) {
        if (/^-+\s+-+/.test(line)) { pastHeader = true }
        continue
      }
      const fields = line.trim().split(/\s{2,}/)
      if (fields.length >= 2 && fields[0] && !fields[0].startsWith('Name')) {
        items.push({ name: fields[0].trim(), source: fields[1]?.trim() || '' })
      }
    }

    // Enrich each bucket with localPath, appCount, lastUpdated
    let scoopPath = ''
    try {
      const { stdout: envOut } = await execPowerShell('echo $env:SCOOP')
      scoopPath = envOut.trim() || join(homedir(), 'scoop')
    } catch {
      scoopPath = join(homedir(), 'scoop')
    }

    const OFFICIAL = new Set(['main', 'extras', 'versions', 'nirsoft', 'php', 'dorado', 'nonportable', 'java', 'games'])
    const result: {
      name: string; source: string; type: 'official' | 'custom'
      localPath: string; appCount: number; lastUpdated: string
    }[] = []

    for (const item of items) {
      const localPath = join(scoopPath, 'buckets', item.name)
      let appCount = 0
      let lastUpdated = ''

      try {
        if (existsSync(localPath)) {
          const ps = `
            $count = (Get-ChildItem -Path '${localPath}' -Filter *.json -File -ErrorAction SilentlyContinue).Count
            $gitDir = Join-Path '${localPath}' '.git'
            $last = ''
            if (Test-Path $gitDir) {
              $last = (git -C '${localPath}' log -1 --format=%ci 2>$null)
            }
            Write-Output "$count|$last"
          `.trim()
          const { stdout: out } = await execPowerShell(ps)
          const [countStr, ...rest] = out.trim().split('|')
          appCount = parseInt(countStr) || 0
          lastUpdated = rest.join('|').trim().slice(0, 16).replace('T', ' ') || ''
        }
      } catch { /* ignore */ }

      result.push({
        name: item.name,
        source: item.source,
        type: OFFICIAL.has(item.name) ? 'official' : 'custom',
        localPath,
        appCount,
        lastUpdated,
      })
    }
    return result
  })

  // Add bucket
  ipcMain.handle('scoop:addBucket', async (_event, name: string, repo?: string) => {
    const cmd = repo ? `bucket add ${name} ${repo}` : `bucket add ${name}`
    return execScoop(cmd)
  })

  // Remove bucket
  ipcMain.handle('scoop:removeBucket', async (_event, name: string) => {
    return execScoop(`bucket rm ${name}`)
  })

  // Get current proxy config
  ipcMain.handle('scoop:getProxy', async () => {
    try {
      const { stdout } = await execScoop('config proxy')
      const output = stdout.trim()
      if (!output || output.includes('is not set') || output.includes('isn\'t set')) {
        return { enabled: false, address: '', type: 'http' as const }
      }
      // scoop config proxy returns something like: proxy = 127.0.0.1:7890
      const match = output.match(/(?:proxy\s*=\s*)(.+)/i)
      const addr = match ? match[1].trim() : output
      if (!addr) {
        return { enabled: false, address: '', type: 'http' as const }
      }
      const isSocks5 = addr.startsWith('socks5://')
      const type = isSocks5 ? 'socks5' as const : 'http' as const
      return { enabled: true, address: addr, type }
    } catch {
      return { enabled: false, address: '', type: 'http' as const }
    }
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
    const scoop = stdout.match(/SCOOP=([^;\s]+)/)?.[1]?.trim() || ''
    const global = stdout.match(/GLOBAL=([^;\s]+)/)?.[1]?.trim() || ''
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
            sendProgress(win, {
              type: 'message',
              package: 'scoop',
              message: data.trim(),
            })
        }
      )
    }
  })

  // ============================================
  // Self-Update: Check for app updates
  // ============================================
  ipcMain.handle('app:checkForUpdate', async (_event, url: string) => {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) return { hasUpdate: false }
      const data = await response.json() as {
        version?: string
        notes?: string
        pub_date?: string
        platforms?: {
          'windows-x86_64'?: { url?: string; signature?: string }
        }
      }
      const remoteVersion = data.version || ''
      const localVersion = app.getVersion()
      if (remoteVersion && remoteVersion !== localVersion) {
        const downloadUrl = data.platforms?.['windows-x86_64']?.url || ''
        return {
          hasUpdate: true,
          version: remoteVersion,
          notes: data.notes || '',
          pubDate: data.pub_date || '',
          downloadUrl,
        }
      }
      return { hasUpdate: false }
    } catch {
      return { hasUpdate: false }
    }
  })

  // ============================================
  // Self-Update: Download update installer
  // ============================================
  ipcMain.handle('app:downloadUpdate', async (event, url: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const filePath = join(tmpdir(), 'scoop-ui-update.exe')
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(300000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const total = Number(response.headers.get('content-length')) || 0
      let downloaded = 0
      const fileStream = createWriteStream(filePath)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fileStream.write(value)
        downloaded += value.byteLength
        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
        if (win && !win.isDestroyed()) {
          win.webContents.send('app:updateProgress', { percent })
        }
      }
      fileStream.end()
      return { success: true, path: filePath }
    } catch (e: any) {
      throw new Error(e.message || 'Download failed')
    }
  })

  // ============================================
  // Self-Update: Exit app and launch installer
  // ============================================
  ipcMain.handle('app:exitAndInstall', async () => {
    const installerPath = join(tmpdir(), 'scoop-ui-update.exe')
    if (!existsSync(installerPath)) {
      throw new Error('Installer not found')
    }
    // Launch installer with silent flags (NSIS: /SILENT, Inno Setup: /SILENT)
    spawn(installerPath, ['/SILENT'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref()
    app.quit()
  })
}
