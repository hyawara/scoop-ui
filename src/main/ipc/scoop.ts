import { ipcMain, BrowserWindow, shell, app, net } from 'electron'
import { execPowerShell, execGitBash, execScoop, execScoopJSON, BASH_EXE } from '../utils/powershell.js'
import { homedir, tmpdir } from 'os'
import { join, basename, dirname } from 'path'
import { createWriteStream, existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { pipeline } from 'stream/promises'
import { execSync, spawn } from 'child_process'

function sendProgress(win: BrowserWindow | null, data: any) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scoop:progress', data)
    win.webContents.send('scoop:log', data)
  }
}

function buildInstallScript(scoopPath: string, globalPath: string): string {
  return `
$env:SCOOP = '${scoopPath.replace(/'/g, "''")}'
$env:SCOOP_GLOBAL = '${globalPath.replace(/'/g, "''")}'
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
irm get.scoop.sh | iex
scoop install git 7zip
`
}

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
  ipcMain.handle('scoop:installScoop', async (event, options?: { scoopPath?: string; globalPath?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const scoopPath = options?.scoopPath || join(homedir(), 'scoop')
    const globalPath = options?.globalPath || join(scoopPath, 'global')
    const script = buildInstallScript(scoopPath, globalPath)
    await execPowerShell(script, (data) => {
        sendProgress(win, {
          type: 'message',
          package: 'scoop',
          message: data.trim(),
        })
    })
  })

  // Search packages (raw text, for precise client-side filtering)
  ipcMain.handle('scoop:searchRaw', async (_event, query: string) => {
    if (!/^[a-zA-Z0-9._\- ]{1,100}$/.test(query)) {
      throw new Error('Invalid search query')
    }
    const { stdout } = await execScoop(`search ${query}`)
    return stdout
  })

  // Search packages (parsed)
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
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}$/.test(name)) {
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
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}$/.test(name)) {
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
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}$/.test(name)) {
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

    for (const line of lines) {
      if (!pastHeader) {
        if (/^-+\s+-+/.test(line)) { pastHeader = true }
        continue
      }
      const fields = line.trim().split(/\s{2,}/)
      if (fields.length >= 2 && fields[0] && fields[1]) {
        const name = fields[0].trim()
        const version = fields[1].trim()
        const bucket = fields[2]?.trim() || ''
        const info = fields[3]?.trim() || ''
        result.push({
          name,
          version,
          bucket,
          global: info.toLowerCase().includes('global'),
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

    let scoopRoot = ''
    try {
      const { stdout: envOut } = await execPowerShell('echo $env:SCOOP')
      scoopRoot = envOut.trim()
    } catch { /* ignore */ }

    const result: {
      name: string; source: string; localPath: string
      appCount: number; lastUpdated: string
    }[] = []

    let pastHeader = false
    for (const raw of stdout.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      if (!pastHeader) {
        if (/^-+\s+-+/.test(line)) { pastHeader = true }
        continue
      }

      // 按字段模式匹配：name + url + 可选的时间 + 可选的 manifests 数
      // 格式: name  url  [date/time]  [count]
      const full = line.match(/^(\S+)\s+(https?:\/\/\S+)\s+(\d{4}\/\d{1,2}\/\d{1,2}\/\S+\s+\d{1,2}:\d{2}:\d{2})\s+(\d+)$/)
      if (full) {
        const name = full[1], source = full[2]
        const lastUpdated = full[3]
        const appCount = parseInt(full[4], 10) || 0
        const localPath = scoopRoot ? join(scoopRoot, 'buckets', name) : join(homedir(), 'scoop', 'buckets', name)
        result.push({ name, source, localPath, appCount, lastUpdated })
        continue
      }

      // Fallback: 只匹配 name + url（没有时间/manifests 的旧行）
      const basic = line.match(/^(\S+)\s+(https?:\/\/\S+)/)
      if (basic) {
        const name = basic[1], source = basic[2]
        const localPath = scoopRoot ? join(scoopRoot, 'buckets', name) : join(homedir(), 'scoop', 'buckets', name)
        result.push({ name, source, localPath, appCount: 0, lastUpdated: '' })
      }
    }

    return result
  })

  // Add bucket
  ipcMain.handle('scoop:addBucket', async (_event, name: string, repo?: string) => {
    const cmd = repo ? `bucket add ${name} ${repo}` : `bucket add ${name}`
    const { stdout, stderr, code } = await execScoop(cmd)
    if (code !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `添加软件源失败 (exit ${code})`)
    }
    return { stdout, stderr, code }
  })

  // Remove bucket
  ipcMain.handle('scoop:removeBucket', async (_event, name: string) => {
    const { stdout, stderr, code } = await execScoop(`bucket rm ${name}`)
    if (code !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `删除软件源失败 (exit ${code})`)
    }
    return { stdout, stderr, code }
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
    let scoop = ''
    let globalPath = ''

    try {
      const { stdout } = await execPowerShell('scoop config root_path')
      scoop = stdout.trim()
    } catch { /* scoop not installed */ }

    try {
      const { stdout } = await execPowerShell('scoop config global_path')
      globalPath = stdout.trim()
    } catch { /* global_path not set */ }

    return { scoop, global: globalPath }
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

  // Open external URL in default browser
  ipcMain.handle('scoop:openExternal', async (_event, url: string) => {
    if (/^https?:\/\/.+/.test(url)) {
      await shell.openExternal(url)
    }
  })

  // Get scoop config key-value pairs
  ipcMain.handle('scoop:config', async () => {
    const { stdout } = await execScoop('config')
    const lines = stdout.split('\n')
    const config: Record<string, string> = {}
    for (const line of lines) {
      // Format: "key               : value"
      const match = line.match(/^\s*(\S[\S ]*?)\s*:\s*(.*)$/)
      if (match) {
        const key = match[1].trim()
        const val = match[2].trim()
        if (key) config[key] = val
      }
    }
    return config
  })

  // Set a single scoop config value
  ipcMain.handle('scoop:setConfig', async (_event, key: string, value: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]{0,100}$/.test(key)) {
      throw new Error('Invalid config key')
    }
    // Remove the config key if value is empty
    if (!value || value.trim() === '') {
      return execScoop(`config rm ${key}`)
    }
    const safeValue = value.includes(' ') ? `"${value}"` : value
    return execScoop(`config ${key} ${safeValue}`)
  })

  // ============================================
  // Self-Update: Check for app updates
  // ============================================

  function semverGt(a: string, b: string): boolean {
    const pa = a.replace(/^v/, '').split('.').map(Number)
    const pb = b.replace(/^v/, '').split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0
      const nb = pb[i] || 0
      if (na > nb) return true
      if (na < nb) return false
    }
    return false
  }

  ipcMain.handle('app:checkForUpdate', async (_event, url: string) => {
    try {
      const response = await net.fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) {
        console.warn(`[app:checkForUpdate] HTTP ${response.status}`)
        return { hasUpdate: false, error: `服务器返回 ${response.status}` }
      }
      const data = await response.json() as {
        version?: string
        notes?: string
        pub_date?: string
        platforms?: {
          'windows-x86_64'?: { url?: string; signature?: string; zipUrl?: string }
        }
      }
      const remoteVersion = data.version || ''
      const localVersion = app.getVersion()
      if (remoteVersion && semverGt(remoteVersion, localVersion)) {
        const downloadUrl = data.platforms?.['windows-x86_64']?.url || ''
        const zipUrl = data.platforms?.['windows-x86_64']?.zipUrl || ''
        return {
          hasUpdate: true,
          version: remoteVersion,
          notes: data.notes || '',
          pubDate: data.pub_date || '',
          downloadUrl,
          zipUrl,
        }
      }
      return { hasUpdate: false }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[app:checkForUpdate]', msg)
      return { hasUpdate: false, error: msg }
    }
  })

  // ============================================
  // Self-Update: Download update installer
  // ============================================
  ipcMain.handle('app:downloadUpdate', async (event, url: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const filePath = join(tmpdir(), 'scoop-ui-update.zip')
    try {
      let response = await net.fetch(url, { signal: AbortSignal.timeout(300000) })
      if (!response.ok && response.status === 404) {
        // gh CLI replaces spaces with dots; try fallback URL
        const fallbackUrl = url.replace(/%20/g, '.')
        const retry = await net.fetch(fallbackUrl, { signal: AbortSignal.timeout(300000) })
        if (retry.ok) response = retry
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const total = Number(response.headers.get('content-length')) || 0
      let downloaded = 0
      const fileStream = createWriteStream(filePath)
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')
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
  // Self-Update: Zip-overlay upgrade via detached git-bash daemon
  //   Phase 1: construct inline bash command (no temp script file)
  //   Phase 2: spawn via git-bash as orphan process (detached + unref)
  //   Phase 3: commit suicide → lock released → bash wakes →
  //            unzip overlay → relaunch → self-cleanup
  // ============================================
  ipcMain.handle('app:startAppUpgrade', async () => {
    const tempDir = app.getPath('temp')
    const zipPath = join(tempDir, 'scoop-ui-update.zip')
    if (!existsSync(zipPath)) {
      throw new Error('升级包未找到，请重新下载')
    }

    const currentExeDir = dirname(app.getPath('exe'))
    const appExeName = basename(app.getPath('exe'))

    // Windows → git-bash path: "C:\Program Files\Scoop-UI" → "/c/Program Files/Scoop-UI"
    const toBashPath = (p: string) => {
      const n = p.replace(/\\/g, '/')
      return /^[A-Za-z]:/.test(n) ? '/' + n[0].toLowerCase() + n.slice(2) : n
    }

    const bashZipPath = toBashPath(zipPath)
    const bashExeDir = toBashPath(currentExeDir)

    // Pure bash upgrade sequence (scoop guarantees git + 7zip installed):
    //   sleep 2         → wait for main process to release file lock
    //   mktemp + 7z x   → extract zip (handles top-level dir)
    //   cp -rf          → overwrite install directory
    //   cmd //c start   → launch new version via Windows shell
    //   rm -rf          → self-cleanup
    const bashCommand = [
      `sleep 2`,
      `TMPD=$(mktemp -d)`,
      `7z x "${bashZipPath}" "-o$TMPD" -y`,
      `TOPD=$(ls -d "$TMPD"/*/ 2>/dev/null | head -1)`,
      `cp -rf "\${TOPD:-$TMPD}/"* "${bashExeDir}/"`,
      `rm -rf "$TMPD"`,
      `cd "${bashExeDir}"`,
      `cmd //c start "" "${appExeName}"`,
      `rm -f "${bashZipPath}"`,
    ].join(' && ')

    const child = spawn(BASH_EXE, ['--login', '-c', bashCommand], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()

    app.exit(0)
  })
}
