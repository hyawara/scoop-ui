import { ipcMain, BrowserWindow, shell, dialog } from 'electron'
import { execPowerShell, execGitBash, execScoop, execScoopJSON } from '../utils/powershell.js'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, statSync, readlinkSync } from 'fs'
import { spawn } from 'child_process'

function sendProgress(win: BrowserWindow | null, data: any) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scoop:progress', data)
    win.webContents.send('scoop:log', data)
  }
}

/**
 * 解析 Scoop 固定宽度表格输出（如 scoop list / scoop status）。
 * 自动跳过分隔线之前的表头，按 2+ 空格切分列。
 * @param stdout scoop 命令原始输出
 * @param mapper 将单行的列数组映射为结果对象，返回 null 则跳过该行
 */
function parseFixedWidthTable<T>(
  stdout: string,
  mapper: (fields: string[]) => T | null
): T[] {
  const result: T[] = []
  let pastHeader = false
  for (const line of stdout.split('\n')) {
    if (!pastHeader) {
      if (/^-+\s+-+/.test(line)) pastHeader = true
      continue
    }
    const fields = line.trim().split(/\s{2,}/)
    const mapped = mapper(fields)
    if (mapped !== null) result.push(mapped)
  }
  return result
}

/**
 * 解析 Scoop 安装根目录。优先级：
 * 1. $SCOOP 环境变量（用户显式设置）
 * 2. `scoop config root_path`（scoop 自己记录的真实根，展开开头的 ~ 为用户主目录）
 * 3. 默认 ~/scoop
 * 解决：非默认路径安装（如 ~/install/scoop）且 $SCOOP 为空时，换源误判 buckets 目录不存在。
 */
async function resolveScoopRoot(): Promise<string> {
  const envRoot = (process.env['SCOOP'] || '').trim()
  if (envRoot) return envRoot
  try {
    const { stdout } = await execPowerShell('scoop config root_path')
    let p = stdout.trim()
    if (p) {
      // 展开开头的 ~ / ~\ / ~/ 为用户主目录（scoop config 常返回 ~/install/scoop 形式）
      if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
        p = join(homedir(), p.slice(1))
      }
      return p
    }
  } catch { /* 读取失败，走默认 */ }
  return join(homedir(), 'scoop')
}

/**
 * 从 scoop list 输出中解析指定包的本地实际安装版本号。
 * 用于更新后的版本双重校验，杜绝"伪成功"。
 * @param listStdout `scoop list` 原始输出
 * @param pkgName 目标包名（大小写不敏感匹配）
 * @returns 本地实际版本号；未找到返回 null
 */
function parseInstalledVersion(listStdout: string, pkgName: string): string | null {
  const rows = parseFixedWidthTable(listStdout, (fields) => {
    if (fields.length < 2 || !fields[0] || !fields[1]) return null
    return { name: fields[0].trim(), version: fields[1].trim() }
  })
  const row = rows.find((r) => r.name.toLowerCase() === pkgName.toLowerCase())
  return row ? row.version : null
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

  // Update packages —— 带 close code 判定 + 版本双重校验，杜绝"伪成功"
  ipcMain.handle('scoop:update', async (event, name?: string) => {
    if (name && !/^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}$/.test(name)) {
      throw new Error('Invalid package name')
    }
    const args = name ? `update ${name}` : 'update --all'
    const win = BrowserWindow.fromWebContents(event.sender)
    const pkgLabel = name || '*'

    // 步骤1：执行更新，onProgress 保留 \r（不 trim），让前端识别进度条回车覆盖
    const { stdout, stderr, code } = await execScoop(args, (data) => {
      sendProgress(win, {
        type: 'update',
        package: pkgLabel,
        message: data,
      })
    })

    // 抓取末尾3行非空日志作为错误摘要
    const tailLog = (): string =>
      (stderr || stdout)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(-3)
        .join('\n')

    // 进程退出码非 0 → 直接判定失败
    if (code !== 0) {
      return {
        success: false,
        package: pkgLabel,
        code,
        error: tailLog() || '更新进程异常退出',
      }
    }

    // 步骤2：仅单包更新做版本双重校验（--all 无法逐一断言，按 code 通过）
    if (name) {
      try {
        const [{ stdout: listStdout }, manifest] = await Promise.all([
          execScoop('list'),
          execScoopJSON<{ version?: string }>(`cat ${name}`),
        ])
        const localVersion = parseInstalledVersion(listStdout, name)
        const expectedVersion = manifest?.version?.trim() || ''

        // 两个版本都取到才断言；任一缺失则降级为通过但记录 verifyError
        if (localVersion && expectedVersion) {
          if (localVersion !== expectedVersion) {
            return {
              success: false,
              package: pkgLabel,
              code,
              localVersion,
              expectedVersion,
              error: `版本校验失败：本地实际版本 ${localVersion}，期望最新版本 ${expectedVersion}`,
            }
          }
          return { success: true, package: pkgLabel, localVersion, expectedVersion }
        }

        return {
          success: true,
          package: pkgLabel,
          localVersion: localVersion || '',
          expectedVersion,
          verifyError: '未能获取完整版本信息，已跳过版本校验',
        }
      } catch (e) {
        // 校验逻辑自身异常 → 不冤枉更新结果，降级为通过但记录
        return {
          success: true,
          package: pkgLabel,
          verifyError: `版本校验执行异常：${(e as Error).message}`,
        }
      }
    }

    return { success: true, package: pkgLabel }
  })

  // ── 旧版本测量：纯 Node.js ──
  function getDirSize(dirPath: string): number {
    let total = 0
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        try {
          if (entry.isDirectory()) {
            total += getDirSize(fullPath)
          } else if (entry.isFile()) {
            total += statSync(fullPath).size
          }
        } catch { /* skip unreadable */ }
      }
    } catch { /* skip unreadable */ }
    return total
  }

  async function getOldVersionTotalBytes(): Promise<number> {
    try {
      const scoopRoot = await resolveScoopRoot()
      const appsDir = join(scoopRoot, 'apps')
      if (!existsSync(appsDir)) return 0

      let total = 0
      for (const app of readdirSync(appsDir, { withFileTypes: true })) {
        if (!app.isDirectory()) continue
        const appDir = join(appsDir, app.name)
        const currentPath = join(appDir, 'current')

        let currentTarget = ''
        try {
          currentTarget = readlinkSync(currentPath)
          currentTarget = join(appDir, currentTarget)
        } catch { /* not a junction */ }

        for (const ver of readdirSync(appDir, { withFileTypes: true })) {
          if (!ver.isDirectory() || ver.name === 'current') continue
          const verPath = join(appDir, ver.name)
          if (currentTarget && verPath.toLowerCase() === currentTarget.toLowerCase()) continue
          total += getDirSize(verPath)
        }
      }
      return total
    } catch {
      return 0
    }
  }

  ipcMain.handle('scoop:cleanup', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const beforeBytes = await getOldVersionTotalBytes()
    await execScoop('cleanup --all', (data) => {
      sendProgress(win, {
        type: 'message',
        package: 'scoop',
        message: data.trim(),
      })
    })
    const afterBytes = await getOldVersionTotalBytes()
    return { released: Math.max(0, beforeBytes - afterBytes) }
  })

  ipcMain.handle('scoop:measureOldVersions', async () => {
    const bytes = await getOldVersionTotalBytes()
    return { bytes }
  })

  // Get cache info
  ipcMain.handle('scoop:cache', async () => {
    try {
      const { stdout } = await execScoop('cache', undefined, undefined, homedir())
      // 解析 "Total: X files, Y MB" 汇总行
      const totalMatch = stdout.match(/Total:\s*(\d+)\s*files?,\s*([\d.]+)\s*(MB|GB)/i)
      if (totalMatch) {
        const files = parseInt(totalMatch[1])
        const size = parseFloat(totalMatch[2])
        const unit = totalMatch[3].toUpperCase()
        return { size, unit, files }
      }
      return { size: 0, unit: 'MB', files: 0 }
    } catch {
      return { size: 0, unit: 'MB', files: 0 }
    }
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
    return parseFixedWidthTable(stdout, (fields) => {
      if (fields.length < 2 || !fields[0] || !fields[1]) return null
      const info = fields[3]?.trim() || ''
      return {
        name: fields[0].trim(),
        version: fields[1].trim(),
        bucket: fields[2]?.trim() || '',
        global: info.toLowerCase().includes('global'),
      }
    })
  })

  // List updatable packages (scoop status: Name, Installed Version, Latest Version, ...)
  ipcMain.handle('scoop:listUpdatable', async () => {
    const { stdout } = await execScoop('status')
    return parseFixedWidthTable(stdout, (fields) => {
      if (fields.length < 3 || !fields[0] || !fields[1] || !fields[2]) return null
      return { name: fields[0].trim(), oldVersion: fields[1].trim(), newVersion: fields[2].trim() }
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

  // Check Aria2 status — returns both installed and enabled separately
  ipcMain.handle('scoop:checkAria2', async () => {
    // Check if aria2 is actually installed on the system via scoop list
    let installed = false
    try {
      const { stdout } = await execScoop('list aria2')
      installed = stdout.trim().length > 0
        && !stdout.toLowerCase().includes("couldn't find")
        && !stdout.toLowerCase().includes('is not installed')
        && !stdout.toLowerCase().includes('no results')
    } catch { /* not installed */ }

    // Check the scoop config flag (aria2-enabled)
    let enabled = false
    try {
      const { stdout } = await execScoop('config aria2-enabled')
      enabled = stdout.trim().toLowerCase() === 'true'
    } catch { /* config not set */ }

    return { installed, enabled }
  })

  // Toggle Aria2 enabled/disabled in scoop config
  ipcMain.handle('scoop:setAria2Enabled', async (_event, enabled: boolean) => {
    await execScoop(`config aria2-enabled ${enabled}`)
    return { success: true }
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

  // Export installed apps list (scoop export)
  ipcMain.handle('scoop:export', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window')

    const { stdout } = await execScoop('export')

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: '导出软件配置清单',
      defaultPath: join(homedir(), 'scoop-apps.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    writeFileSync(filePath, stdout, 'utf-8')
    return { success: true, path: filePath }
  })

  // Import apps list (scoop import)
  ipcMain.handle('scoop:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window')

    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: '选择配置清单文件',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })

    if (canceled || filePaths.length === 0) return { success: false, canceled: true }

    const filePath = filePaths[0]
    let content: string
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch {
      throw new Error('无法读取文件')
    }

    // 验证是否为合法 JSON
    try {
      JSON.parse(content)
    } catch {
      throw new Error('无效的配置文件：文件内容不是合法的 JSON 格式')
    }

    // 写入临时文件供 scoop import 使用
    const tmpFile = join(tmpdir(), `scoop-import-${Date.now()}.json`)
    writeFileSync(tmpFile, content, 'utf-8')

    try {
      await execScoop(`import "${tmpFile}"`)
      return { success: true, path: filePath }
    } finally {
      try { unlinkSync(tmpFile) } catch { /* ignore */ }
    }
  })

  // Open external URL in default browser
  ipcMain.handle('scoop:openExternal', async (_event, url: string) => {
    if (/^https?:\/\/.+/.test(url)) {
      await shell.openExternal(url)
    }
  })

  // Open a local directory/file in the system file explorer
  ipcMain.handle('scoop:openPath', async (_event, path: string) => {
    if (!path) return
    await shell.openPath(path)
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
  // Switch Mirror — 无损换源：git remote set-url（保留本地已拉取的 manifest，秒切不重拉）
  // 绝不使用 bucket rm/add（有损：删目录 + 重新 clone，慢且掉 aria2 语境）
  // ============================================

  // 官方标准 bucket 的 GitHub 仓库地址（大小写严格匹配 scoop 官方组织）
  const OFFICIAL_BUCKET_REPOS: Record<string, string> = {
    main: 'https://github.com/ScoopInstaller/Main.git',
    extras: 'https://github.com/ScoopInstaller/Extras.git',
    versions: 'https://github.com/ScoopInstaller/Versions.git',
    nirsoft: 'https://github.com/ScoopInstaller/Nirsoft.git',
    java: 'https://github.com/ScoopInstaller/Java.git',
    games: 'https://github.com/Calinou/scoop-games.git',
  }

  /**
   * 依据镜像方案，为单个官方 bucket 计算目标 remote url。
   * @param name    bucket 名（小写）
   * @param mirror  'official' | 'ghproxy' | 'custom'
   * @param prefix  ghproxy/custom 的代理前缀（如 https://gh-proxy.com/）
   */
  function resolveBucketUrl(name: string, mirror: string, prefix: string): string | null {
    const officialUrl = OFFICIAL_BUCKET_REPOS[name]
    if (!officialUrl) return null // 非官方 bucket（用户自建）不动它
    if (mirror === 'official') return officialUrl
    // ghproxy / custom：在官方 GitHub 地址前注入代理前缀
    return `${prefix}${officialUrl}`
  }

  /**
   * 无缝切换镜像源。
   * payload: { mirror: 'official'|'ghproxy'|'custom', prefix?: string }
   * - official: remote 恢复为 github.com 官方地址
   * - ghproxy / custom: remote 改为 <prefix>https://github.com/ScoopInstaller/Xxx.git
   * 仅改写 origin remote url，不 clone、不删目录，本地 manifest 完整保留。
   */
  ipcMain.handle('scoop:switchMirror', async (_event, payload: { mirror: string; prefix?: string }) => {
    const mirror = payload?.mirror || 'official'
    let prefix = (payload?.prefix || '').trim()

    // 前缀基础校验：必须是 https URL，且规范化为以 / 结尾
    if (mirror !== 'official') {
      if (!/^https:\/\/[\w.\-]+(:\d+)?\/.*$/.test(prefix) && !/^https:\/\/[\w.\-]+(:\d+)?\/?$/.test(prefix)) {
        throw new Error('无效的镜像前缀地址（需为 https 开头）')
      }
      if (!prefix.endsWith('/')) prefix += '/'
    }

    // 1. 换源前读取 aria2 状态（仅读取，作为守护基线）
    let aria2WasEnabled = false
    try {
      const { stdout } = await execScoop('config aria2-enabled')
      aria2WasEnabled = stdout.trim().toLowerCase() === 'true'
    } catch { /* 未设置视为 false */ }

    // 2. 定位 $SCOOP/buckets 目录，枚举本地实际存在的 bucket
    const scoopRoot = await resolveScoopRoot()
    const bucketsDir = join(scoopRoot, 'buckets')

    let localBuckets: string[] = []
    try {
      localBuckets = readdirSync(bucketsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && existsSync(join(bucketsDir, d.name, '.git')))
        .map((d) => d.name)
    } catch {
      throw new Error(`未找到 Scoop buckets 目录：${bucketsDir}`)
    }

    // 3. 逐个 bucket 串行执行 git remote set-url（无损）
    const results: { bucket: string; ok: boolean; url?: string; error?: string }[] = []
    for (const name of localBuckets) {
      const targetUrl = resolveBucketUrl(name.toLowerCase(), mirror, prefix)
      if (!targetUrl) continue // 跳过非官方 bucket，绝不误伤用户自建源

      const bucketPath = join(bucketsDir, name)
      // 用 git -C 显式锁定仓库目录，避免 --login 加载 profile 时 cd 漂移
      const { stderr, code } = await execGitBash(
        `git -C "${bucketPath}" remote set-url origin "${targetUrl}"`
      )
      if (code === 0) {
        results.push({ bucket: name, ok: true, url: targetUrl })
      } else {
        results.push({ bucket: name, ok: false, error: (stderr || '').trim() || `git 退出码 ${code}` })
      }
    }

    if (results.length === 0) {
      throw new Error('未找到可切换的官方 bucket（main/extras 等）')
    }

    // 4. 换源后再次确认 aria2 状态；若原为开启却意外被重置，则显式恢复（安全隔离）
    let aria2Restored = false
    if (aria2WasEnabled) {
      let stillEnabled = false
      try {
        const { stdout } = await execScoop('config aria2-enabled')
        stillEnabled = stdout.trim().toLowerCase() === 'true'
      } catch { /* 读取失败按未开启处理 */ }
      if (!stillEnabled) {
        try {
          await execScoop('config aria2-enabled true')
          aria2Restored = true
        } catch { /* 恢复失败不阻断换源主流程 */ }
      }
    }

    const switched = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok)
    return {
      success: failed.length === 0,
      mirror,
      switched,
      total: results.length,
      results,
      aria2WasEnabled,
      aria2Restored,
      error: failed.length > 0
        ? `${failed.length} 个 bucket 换源失败：${failed.map((f) => f.bucket).join(', ')}`
        : undefined,
    }
  })

  // ============================================
  // 内嵌命令执行器 — 允许用户在应用内直接执行后置配置命令
  // 安全机制：白名单 + 危险命令拦截
  // ============================================

  // 安全白名单：只允许执行Scoop相关的辅助命令
  const ALLOWED_COMMAND_PATTERNS = [
    /^scoop\s+(reset|uninstall|install|update|checkup|cleanup|config|bucket|list|status|search|info|cat|home|prefix|which|shim|export|import|hold|unhold|hold-check|virustotal|help)/i,
    /^(mysqld|nginx|redis-server|redis-cli|node|npm|yarn|pnpm|python|pip|java|javac|gradle|maven|mvn)\s+/i,
    /^shim\s+/i,
    /^netsh\s+/i,
    /^Set-ExecutionPolicy\s+/i,
  ]

  // 危险命令黑名单
  const DANGEROUS_PATTERNS = [
    /rm\s+-rf/i,
    /rmdir\s+\/s/i,
    /del\s+\/s/i,
    /format\s+[a-z]/i,
    /shutdown/i,
    /reboot/i,
    /Remove-Item\s+.*-Recurse.*-Force/i,
    /Clear-Content/i,
  ]

  function isCommandSafe(command: string): { safe: boolean; reason?: string } {
    // 检查危险命令黑名单
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return { safe: false, reason: `检测到危险命令: ${command}` }
      }
    }

    // 检查白名单
    const isAllowed = ALLOWED_COMMAND_PATTERNS.some(pattern => pattern.test(command.trim()))
    if (!isAllowed) {
      return { safe: false, reason: `命令不在白名单内: ${command}` }
    }

    // 限制命令长度
    if (command.length > 500) {
      return { safe: false, reason: '命令过长' }
    }

    return { safe: true }
  }

  // 注册executeCommand处理器
  ipcMain.handle('scoop:executeCommand', async (event, command: string) => {
    // 安全校验
    const validation = isCommandSafe(command)
    if (!validation.safe) {
      throw new Error(validation.reason || '命令安全校验失败')
    }

    const win = BrowserWindow.fromWebContents(event.sender)

    return new Promise((resolve, reject) => {
      // 使用PowerShell执行命令（与项目现有模式一致）
      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        command
      ], {
        env: process.env,
        shell: false,
      })

      child.stdout.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        // 实时推送日志到renderer
        if (win && !win.isDestroyed()) {
          win.webContents.send('scoop:executeCommand:log', {
            command,
            type: 'stdout',
            content: chunk,
          })
        }
      })

      child.stderr.on('data', (data: Buffer) => {
        const chunk = data.toString('utf-8')
        if (win && !win.isDestroyed()) {
          win.webContents.send('scoop:executeCommand:log', {
            command,
            type: 'stderr',
            content: chunk,
          })
        }
      })

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve({ success: true })
        } else {
          reject(new Error(`命令执行失败，退出码: ${code}`))
        }
      })

      child.on('error', (err: Error) => {
        reject(err)
      })
    })
  })
}
