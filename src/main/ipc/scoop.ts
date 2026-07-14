import { ipcMain, BrowserWindow, shell, dialog } from 'electron'
import { execPowerShell, execGitBash, execScoop, execScoopJSON, execScoopRaw } from '../utils/powershell.js'
import { getAppVersionMap, setAppVersionMap, type AppVersionEntry } from '../utils/config.js'
import { checkScoopUpdatesFast } from '../services/status.js'
import { homedir, tmpdir } from 'os'
import { join, basename, resolve, relative, isAbsolute } from 'path'
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, realpathSync, promises as fsp } from 'fs'
import { spawn } from 'child_process'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'

function sendProgress(win: BrowserWindow | null, data: any) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scoop:progress', data)
    win.webContents.send('scoop:log', data)
  }
}

type CancellableScoopTaskType = 'install' | 'uninstall' | 'update' | 'message'
type CancellableScoopTaskStatus = 'started' | 'ended' | 'aborted'

interface CancellableScoopTask {
  id: number
  type: CancellableScoopTaskType
  label: string
  packages: string[]
  startedAt: number
  controller: AbortController
}

let nextScoopTaskId = 1
const activeScoopTasks = new Map<number, CancellableScoopTask>()
let sudoCache: { available: boolean; checkedAt: number } | null = null
let adminCache: { elevated: boolean; checkedAt: number } | null = null
const SUDO_CACHE_TTL = 30_000
const ADMIN_CACHE_TTL = 30_000

function getCommandState(event?: {
  status: CancellableScoopTaskStatus
  task: Omit<CancellableScoopTask, 'controller'>
}) {
  const tasks = [...activeScoopTasks.values()].map(({ controller: _controller, ...task }) => task)
  return {
    active: tasks.length > 0,
    count: tasks.length,
    tasks,
    event,
  }
}

function broadcastCommandState(event?: {
  status: CancellableScoopTaskStatus
  task: Omit<CancellableScoopTask, 'controller'>
}) {
  const payload = getCommandState(event)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('scoop:commandState', payload)
    }
  }
}

function beginScoopTask(
  type: CancellableScoopTaskType,
  label: string,
  packages: string[]
): CancellableScoopTask {
  const task: CancellableScoopTask = {
    id: nextScoopTaskId++,
    type,
    label,
    packages,
    startedAt: Date.now(),
    controller: new AbortController(),
  }
  activeScoopTasks.set(task.id, task)
  const { controller: _controller, ...publicTask } = task
  broadcastCommandState({ status: 'started', task: publicTask })
  return task
}

function finishScoopTask(task: CancellableScoopTask, status: 'ended' | 'aborted') {
  activeScoopTasks.delete(task.id)
  const { controller: _controller, ...publicTask } = task
  broadcastCommandState({ status, task: publicTask })
}

function sendLogEnd(
  win: BrowserWindow | null,
  data: { package: string; packages?: string[]; success: boolean; code?: number | null; aborted?: boolean }
) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('scoop:logEnd', data)
  }
}

function tailLog(stdout: string, stderr: string): string {
  return (stderr || stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join('\n')
}

function normalizeExitError(
  action: 'Install' | 'Update' | 'Uninstall',
  label: string,
  stdout: string,
  stderr: string,
  code: number | null,
  aborted?: boolean
): string {
  if (aborted) return `${action} aborted: ${label}`
  return tailLog(stdout, stderr) || `${action} failed: ${label} (exit ${code ?? 'unknown'})`
}

const DIAGNOSTIC_LINE_PATTERN = /(?:^|\b)(?:ERROR:?|ERR!|ERR\b|error\b|failed\b|failure\b|fatal\b|exception\b|denied\b|permission\b|EPERM\b|EACCES\b|ENOENT\b|ETIMEDOUT\b|ECONNRESET\b|hash check failed|couldn'?t|cannot|can't|not found|npm\s+(?:ERR!|error)|pnpm\s+(?:ERR|error))/i

function extractCommandDiagnostics(stdout: string, stderr: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const line of `${stderr}\n${stdout}`.split('\n')) {
    const text = line.trim()
    if (!text || !DIAGNOSTIC_LINE_PATTERN.test(text)) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }
  return result.slice(-8)
}

function sendCommandFailure(
  win: BrowserWindow | null,
  type: CancellableScoopTaskType,
  label: string,
  action: 'Install' | 'Update' | 'Uninstall',
  error: string,
  aborted?: boolean
) {
  sendProgress(win, {
    type,
    package: label,
    message: `ERROR: ${aborted ? `${action} aborted` : `${action} failed`}: ${label}\n${error}`,
  })
}

async function detectSudoAvailable(force = false): Promise<boolean> {
  const now = Date.now()
  if (!force && sudoCache && now - sudoCache.checkedAt < SUDO_CACHE_TTL) {
    return sudoCache.available
  }

  try {
    const { stdout } = await execPowerShell(`
      if (Get-Command sudo -ErrorAction SilentlyContinue) {
        Write-Output "YES"
      } else {
        Write-Output "NO"
      }
    `)
    const available = stdout.trim().includes('YES')
    sudoCache = { available, checkedAt: now }
    return available
  } catch {
    sudoCache = { available: false, checkedAt: now }
    return false
  }
}

async function detectProcessElevated(force = false): Promise<boolean> {
  const now = Date.now()
  if (!force && adminCache && now - adminCache.checkedAt < ADMIN_CACHE_TTL) {
    return adminCache.elevated
  }

  try {
    const { stdout } = await execPowerShell(`
      $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
      $principal = [Security.Principal.WindowsPrincipal]::new($identity)
      if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Output "YES"
      } else {
        Write-Output "NO"
      }
    `)
    const elevated = stdout.trim().includes('YES')
    adminCache = { elevated, checkedAt: now }
    return elevated
  } catch {
    adminCache = { elevated: false, checkedAt: now }
    return false
  }
}

async function ensureGlobalPrivilege(
  win: BrowserWindow | null,
  type: CancellableScoopTaskType,
  label: string,
  global?: boolean
): Promise<{ ok: true; useSudo: boolean } | { ok: false; error: string }> {
  if (!global) return { ok: true, useSudo: false }

  if (await detectProcessElevated()) {
    return { ok: true, useSudo: false }
  }

  const sudoAvailable = await detectSudoAvailable()
  if (!sudoAvailable) {
    return {
      ok: false,
      error: 'Global 操作需要管理员权限。请先执行 `scoop install sudo`，或以管理员身份运行 Scoop UI。',
    }
  }

  sendProgress(win, {
    type,
    package: label,
    message: '检测到 global 操作，正在通过 sudo 请求管理员权限...',
  })
  return { ok: true, useSudo: true }
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

type SearchEngineName = 'scoop-search' | 'native'

interface SearchEngineStatus {
  installed: boolean
  engine: SearchEngineName
  path?: string
}

interface SearchPackageResult {
  name: string
  version: string
  description: string
  bucket: string
  engine?: SearchEngineName
}

let searchEngineCache: { value: SearchEngineStatus; checkedAt: number } | null = null
const SEARCH_ENGINE_CACHE_TTL = 15_000

function bashQuoteMain(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

function validateSearchQuery(query: string): string {
  const normalized = query.trim()
  if (!/^[a-zA-Z0-9._\- ]{1,100}$/.test(normalized)) {
    throw new Error('Invalid search query')
  }
  return normalized
}

async function detectScoopSearchInstalled(force = false): Promise<SearchEngineStatus> {
  const now = Date.now()
  if (!force && searchEngineCache && now - searchEngineCache.checkedAt < SEARCH_ENGINE_CACHE_TTL) {
    return searchEngineCache.value
  }

  const scoopRoot = await resolveScoopRoot()
  const candidates = [
    join(scoopRoot, 'apps', 'scoop-search', 'current'),
    join(scoopRoot, 'shims', 'scoop-search.exe'),
    join(scoopRoot, 'shims', 'scoop-search.ps1'),
    join(scoopRoot, 'shims', 'scoop-search.cmd'),
    process.env['SCOOP_GLOBAL'] ? join(process.env['SCOOP_GLOBAL'], 'apps', 'scoop-search', 'current') : '',
    process.env['SCOOP_GLOBAL'] ? join(process.env['SCOOP_GLOBAL'], 'shims', 'scoop-search.exe') : '',
  ].filter(Boolean)

  const found = candidates.find(candidate => existsSync(candidate))
  const value: SearchEngineStatus = found
    ? { installed: true, engine: 'scoop-search', path: found }
    : { installed: false, engine: 'native' }

  searchEngineCache = { value, checkedAt: now }
  return value
}

function pickString(obj: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function normalizeBucketName(raw: string): string {
  return raw.replace(/^\[/, '').replace(/\]$/, '').trim()
}

function parseSearchJsonObject(obj: Record<string, any>, engine: SearchEngineName): SearchPackageResult | null {
  const name = pickString(obj, ['name', 'Name', 'app', 'App', 'appName', 'AppName'])
  const version = pickString(obj, ['version', 'Version'])
  const bucket = normalizeBucketName(pickString(obj, ['bucket', 'Bucket', 'source', 'Source', 'repo', 'Repo']))
  const description = pickString(obj, ['description', 'Description', 'desc', 'Desc', 'summary', 'Summary'])
  if (!name) return null
  return { name, version, bucket, description, engine }
}

function flattenJsonRecords(value: unknown): Record<string, any>[] {
  const records: Record<string, any>[] = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') return

    const record = node as Record<string, any>
    records.push(record)
    for (const child of Object.values(record)) {
      if (child && typeof child === 'object') {
        visit(child)
      }
    }
  }

  visit(value)
  return records
}

async function parseManifestPath(line: string, engine: SearchEngineName): Promise<SearchPackageResult | null> {
  const match = line.match(/(?:^|\s)([A-Za-z]:)?[^:"<>|?*\r\n]*?[\\/]buckets[\\/](?<bucket>[^\\/]+)[\\/]bucket[\\/](?<name>[^\\/]+)\.json\b/i)
  if (!match?.groups?.bucket || !match.groups.name) return null

  const fullPath = match[0].trim()
  const manifest = existsSync(fullPath)
    ? await readJsonManifest(fullPath)
    : null

  return {
    name: match.groups.name,
    version: typeof manifest?.version === 'string' ? manifest.version : '',
    bucket: match.groups.bucket,
    description: typeof manifest?.description === 'string' ? manifest.description : '',
    engine,
  }
}

async function readJsonManifest(path: string): Promise<Record<string, any> | null> {
  try {
    return JSON.parse(await fsp.readFile(path, 'utf-8')) as Record<string, any>
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function resolveGithubLatestApi(value: string): string {
  const raw = value.trim()
  let repo = ''

  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    repo = raw
  } else {
    try {
      const url = new URL(raw)
      if (url.hostname.toLowerCase() === 'github.com') {
        const [owner, name] = url.pathname.split('/').filter(Boolean)
        if (owner && name) repo = `${owner}/${name.replace(/\.git$/i, '')}`
      }
    } catch {
      repo = ''
    }
  }

  return repo ? `https://api.github.com/repos/${repo}/releases/latest` : ''
}

function resolveCheckverUrl(checkver: unknown): string {
  if (typeof checkver === 'string') {
    const value = checkver.trim()
    return /^https?:\/\//i.test(value) ? value : ''
  }

  if (!isRecord(checkver)) return ''

  const url = checkver.url
  if (typeof url === 'string' && url.trim()) return url.trim()

  const github = checkver.github
  if (typeof github === 'string' && github.trim()) {
    return resolveGithubLatestApi(github)
  }

  return ''
}

function fetchCheckverText(url: string, redirectCount = 0): Promise<{ text: string; finalUrl: string }> {
  return new Promise((resolvePromise, reject) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      reject(new Error('无效的 checkver.url'))
      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error('checkver.url 仅支持 http/https'))
      return
    }

    const request = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const req = request(
      parsed,
      {
        method: 'GET',
        timeout: 12_000,
        headers: {
          'User-Agent': 'Scoop-UI/checkver',
          Accept: 'application/json,text/plain,text/html,*/*',
        },
      },
      (res) => {
        const status = res.statusCode || 0
        const location = res.headers.location

        if ([301, 302, 303, 307, 308].includes(status) && location) {
          res.resume()
          if (redirectCount >= 5) {
            reject(new Error('checkver.url 重定向过多'))
            return
          }
          resolvePromise(fetchCheckverText(new URL(location, parsed).toString(), redirectCount + 1))
          return
        }

        if (status < 200 || status >= 300) {
          res.resume()
          reject(new Error(`请求 checkver.url 失败：HTTP ${status}`))
          return
        }

        res.setEncoding('utf8')
        let text = ''
        res.on('data', (chunk) => {
          text += chunk
          if (text.length > 2_000_000) {
            req.destroy(new Error('checkver 响应过大'))
          }
        })
        res.on('end', () => resolvePromise({ text, finalUrl: parsed.toString() }))
      }
    )

    req.on('timeout', () => req.destroy(new Error('请求 checkver.url 超时')))
    req.on('error', reject)
    req.end()
  })
}

function buildCheckverRegex(pattern: string): RegExp | null {
  let source = pattern.trim()
  let flags = 'im'
  const inline = source.match(/^\(\?([is]+)\)/i)
  if (inline) {
    if (inline[1].toLowerCase().includes('s')) flags = 'ims'
    source = source.slice(inline[0].length)
  }
  try {
    return new RegExp(source, flags)
  } catch {
    return null
  }
}

function applyCheckverReplace(template: string, match: RegExpExecArray): string {
  let result = template
  if (match.groups) {
    for (const [key, value] of Object.entries(match.groups)) {
      result = result
        .replace(new RegExp(`\\$<${key}>`, 'g'), value || '')
        .replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value || '')
    }
  }
  return result.replace(/\$(\d+)/g, (_all, index) => match[Number(index)] || '')
}

function cleanCheckverVersion(value: string): string {
  let version = value.trim().replace(/^["']|["']$/g, '').trim()
  if (!version) return ''

  const match = version.match(/v?(\d+(?:[._-]\d+)+(?:[-+][0-9A-Za-z.-]+)?|\d+(?:[-+][0-9A-Za-z.-]+)?)/)
  if (match) version = match[1]
  return version.replace(/^v(?=\d)/i, '').replace(/_/g, '.')
}

function getSimpleJsonPathValue(root: unknown, jsonPath: string): string {
  const normalized = jsonPath.trim().replace(/^\$\.?/, '')
  if (!normalized) return ''

  let current: any = root
  for (const token of normalized.split('.').filter(Boolean)) {
    const match = token.match(/^([^[\]]+)?(?:\[(\d+)\])?$/)
    if (!match) return ''
    const key = match[1]
    const index = match[2] === undefined ? null : Number(match[2])

    if (key) {
      if (!isRecord(current)) return ''
      current = current[key]
    }

    if (index !== null) {
      if (!Array.isArray(current)) return ''
      current = current[index]
    }
  }

  if (typeof current === 'string' || typeof current === 'number') return String(current)
  return ''
}

function pickVersionFromJson(value: unknown): string {
  if (!isRecord(value)) return ''
  for (const key of ['tag_name', 'version', 'name', 'tag', 'latest']) {
    const picked = value[key]
    if (typeof picked === 'string' && picked.trim()) return picked.trim()
    if (typeof picked === 'number') return String(picked)
  }
  return ''
}

function extractVersionByRegex(text: string, checkver: Record<string, any>): string {
  const regex = typeof checkver.regex === 'string' ? buildCheckverRegex(checkver.regex) : null
  if (!regex) return ''

  const match = regex.exec(text)
  if (!match) return ''

  if (typeof checkver.replace === 'string' && checkver.replace.trim()) {
    return cleanCheckverVersion(applyCheckverReplace(checkver.replace, match))
  }

  const named = match.groups?.version || match.groups?.Version
  return cleanCheckverVersion(named || match[1] || match[0] || '')
}

function extractCheckverVersion(text: string, finalUrl: string, checkver: unknown): string {
  const record = isRecord(checkver) ? checkver : {}
  const jsonPath = typeof record.jsonpath === 'string' ? record.jsonpath.trim() : ''

  if (jsonPath) {
    try {
      const json = JSON.parse(text)
      const jsonPathValue = getSimpleJsonPathValue(json, jsonPath)
      if (jsonPathValue) {
        const byRegex = extractVersionByRegex(jsonPathValue, record)
        return byRegex || cleanCheckverVersion(jsonPathValue)
      }
    } catch {
      // 非 JSON 响应继续走 regex / 文本兜底。
    }
  }

  const byRegex = extractVersionByRegex(text, record)
  if (byRegex) return byRegex

  try {
    const json = JSON.parse(text)
    const fromJson = pickVersionFromJson(json)
    if (fromJson) return cleanCheckverVersion(fromJson)
  } catch {
    // 非 JSON 响应继续走 URL / 文本兜底。
  }

  const fromFinalUrl = finalUrl.match(/(?:tag|download|releases?)\/v?([^/?#]+)/i)
  if (fromFinalUrl) return cleanCheckverVersion(fromFinalUrl[1])

  const fromText = text.match(/v?(\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?)/)
  return fromText ? cleanCheckverVersion(fromText[1]) : ''
}

function pushSearchResult(
  result: SearchPackageResult[],
  seen: Set<string>,
  item: SearchPackageResult | null,
  engine: SearchEngineName
) {
  if (!item?.name) return
  const bucket = normalizeBucketName(item.bucket || '')
  const key = `${bucket.toLowerCase()}/${item.name.toLowerCase()}`
  if (seen.has(key)) return
  seen.add(key)
  result.push({
    name: item.name,
    version: item.version || '',
    bucket,
    description: item.description || '',
    engine,
  })
}

async function parseSearchOutput(stdout: string, engine: SearchEngineName): Promise<SearchPackageResult[]> {
  const result: SearchPackageResult[] = []
  const seen = new Set<string>()
  const trimmedStdout = stdout.trim()

  if (trimmedStdout.startsWith('{') || trimmedStdout.startsWith('[')) {
    try {
      const json = JSON.parse(trimmedStdout)
      for (const item of flattenJsonRecords(json)) {
        const parsed = parseSearchJsonObject(item, engine)
        if (parsed) {
          pushSearchResult(result, seen, parsed, engine)
          continue
        }
        const manifestPath = pickString(item, ['path', 'Path', 'manifest', 'Manifest', 'manifestPath', 'ManifestPath'])
        if (manifestPath) {
          pushSearchResult(result, seen, await parseManifestPath(manifestPath, engine), engine)
        }
      }
      if (result.length > 0) return result
    } catch { /* 不是整体 JSON，继续按行解析 */ }
  }

  let inTable = false
  let currentBucket = ''
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.replace(/\r/g, '')
    const trimmed = line.trim()
    if (!trimmed || /^(Results|No results|No matches|WARN|ERROR)/i.test(trimmed)) continue

    if (/^-{3,}/.test(trimmed)) {
      inTable = true
      continue
    }

    const jsonLine = trimmed.startsWith('{') && trimmed.endsWith('}')
    if (jsonLine) {
      try {
        const item = JSON.parse(trimmed)
        const parsed = parseSearchJsonObject(item, engine)
        if (parsed) {
          pushSearchResult(result, seen, parsed, engine)
          continue
        }
        const manifestPath = pickString(item, ['path', 'Path', 'manifest', 'Manifest', 'manifestPath', 'ManifestPath'])
        if (manifestPath) {
          pushSearchResult(result, seen, await parseManifestPath(manifestPath, engine), engine)
          continue
        }
        continue
      } catch { /* 不是 JSON 行，继续文本解析 */ }
    }

    const pathItem = await parseManifestPath(trimmed, engine)
    if (pathItem) {
      pushSearchResult(result, seen, pathItem, engine)
      continue
    }

    const bucketHeader = trimmed.match(/^['"]?([^'":]+)['"]?\s+bucket:?$/i)
    if (bucketHeader) {
      currentBucket = bucketHeader[1].trim()
      continue
    }

    const grouped = trimmed.match(/^([\w.+-]+)\s+\(([^)]+)\)\s*(?:\[(.*?)\])?\s*(.*)$/)
    if (grouped) {
      pushSearchResult(result, seen, {
        name: grouped[1],
        version: grouped[2],
        bucket: grouped[3] || currentBucket,
        description: grouped[4] || '',
        engine,
      }, engine)
      continue
    }

    const slash = trimmed.match(/^(?<bucket>[\w.-]+)[\\/](?<name>[\w.+-]+)\s+(?<version>\S+)\s*(?<desc>.*)$/)
    if (slash?.groups) {
      pushSearchResult(result, seen, {
        name: slash.groups.name,
        version: slash.groups.version,
        bucket: slash.groups.bucket,
        description: slash.groups.desc || '',
        engine,
      }, engine)
      continue
    }

    const fields = trimmed.split(/\s{2,}/)
    if (inTable && fields.length >= 2) {
      pushSearchResult(result, seen, {
        name: fields[0],
        version: fields[1] || '',
        bucket: normalizeBucketName(fields[2] || currentBucket),
        description: fields.slice(3).join(' ').trim(),
        engine,
      }, engine)
      continue
    }

    const loose = trimmed.match(/^([\w.+-]+)\s+(\S+)\s+(\[?[\w.-]+\]?)\s*(.*)$/)
    if (loose) {
      pushSearchResult(result, seen, {
        name: loose[1],
        version: loose[2],
        bucket: normalizeBucketName(loose[3]),
        description: loose[4] || '',
        engine,
      }, engine)
    }
  }

  return result
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
  ipcMain.handle('scoop:getCommandState', async () => getCommandState())

  ipcMain.handle('scoop:abortCommand', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const tasks = [...activeScoopTasks.values()]
    if (tasks.length === 0) {
      return { success: false, aborted: 0 }
    }

    sendProgress(win, {
      type: 'message',
      package: 'scoop',
      message: `正在中止 ${tasks.length} 个 Scoop 命令...`,
    })

    for (const task of tasks) {
      if (!task.controller.signal.aborted) {
        task.controller.abort()
      }
    }

    return { success: true, aborted: tasks.length }
  })

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
    const normalized = validateSearchQuery(query)
    const status = await detectScoopSearchInstalled()
    const { stdout } = status.installed
      ? await execGitBash(`scoop-search ${bashQuoteMain(normalized)}`)
      : await execScoop(`search ${normalized}`)
    return stdout
  })

  ipcMain.handle('scoop:searchEngineStatus', async (_event, force?: boolean) => {
    return detectScoopSearchInstalled(Boolean(force))
  })

  ipcMain.handle('scoop:installSearchEngine', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const task = beginScoopTask('install', 'scoop-search', ['scoop-search'])

    try {
      const { stdout, stderr, code, aborted } = await execScoopRaw(['install', 'scoop-search'], (data, stream) => {
        sendProgress(win, {
          type: 'install',
          package: 'scoop-search',
          stream,
          message: data,
        })
      }, task.controller.signal)

      searchEngineCache = null
      const status = aborted ? { installed: false, engine: 'native' as const } : await detectScoopSearchInstalled(true)
      const success = code === 0 && status.installed && !aborted
      const error = success
        ? undefined
        : normalizeExitError('Install', 'scoop-search', stdout, stderr, code, aborted)

      if (!success && error) {
        sendCommandFailure(win, 'install', 'scoop-search', 'Install', error, aborted)
      }
      sendLogEnd(win, {
        package: 'scoop-search',
        packages: ['scoop-search'],
        success,
        code,
        aborted,
      })

      return {
        success,
        stdout,
        stderr,
        code,
        status,
        aborted,
        error,
      }
    } finally {
      finishScoopTask(task, task.controller.signal.aborted ? 'aborted' : 'ended')
    }
  })

  // Search packages (parsed)
  ipcMain.handle('scoop:search', async (_event, query: string) => {
    const normalized = validateSearchQuery(query)
    const status = await detectScoopSearchInstalled()
    const engine = status.installed ? 'scoop-search' : 'native'
    const { stdout } = status.installed
      ? await execGitBash(`scoop-search ${bashQuoteMain(normalized)}`)
      : await execScoop(`search ${normalized}`)
    return parseSearchOutput(stdout, engine)
  })

  // ============================================
  // 惰性按需同步：解析 `scoop search <app>` 全量版本并回写 ~/.scoop-ui/config.json
  // ============================================

  /** 转义正则元字符，供动态构建包名变体匹配（notepad++ / c++ 等含特殊字符名亦安全）。 */
  function escapeReMain(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // 版本线 / 发布通道 / 架构 语义后缀白名单（用于识别 base-<suffix> 形态的变体）
  const VARIANT_SUFFIXES =
    'lts|nightly|current|rc|beta|alpha|dev|devel|preview|insider|insiders|canary|stable|latest|edge|msvc|gnu|full|light|portable|np|x86|x64|x86_64|arm64|aarch64|jre|jdk'

  /**
   * 生态关联别名：少数软件的"多版本"跨命名，无法从主名推断（如 openjdk 生态含 zulu-jdk / temurin / corretto）。
   * 命中此表的包名也视为该 base 的关联版本。可按需扩展键值。
   */
  const ECOSYSTEM_ALIASES: Record<string, RegExp> = {
    // JDK / Java 生态：各发行版（可带版本号后缀）
    openjdk: /^(?:openjdk|ojdkbuild|zulu(?:-jdk)?|temurin|corretto|liberica(?:-(?:full|jdk|jre))?|microsoft-jdk|ms-openjdk|graalvm(?:-jdk|-nik)?|sapmachine|dragonwell|semeru|adopt(?:ium|openjdk)?|oraclejdk)(?:[-_]?\d[\w.\-]*)?$/i,
    java: /^(?:openjdk|ojdkbuild|zulu(?:-jdk)?|temurin|corretto|liberica|microsoft-jdk|ms-openjdk|graalvm|sapmachine|dragonwell|semeru|adopt(?:ium|openjdk)?|oraclejdk)(?:[-_]?\d[\w.\-]*)?$/i,
  }

  /**
   * 判定包名 name 是否为软件 base 的"版本变体"（精确形状匹配，取代宽松 includes）：
   *   - 完全同名：nodejs === nodejs
   *   - base + 数字（可点分、可分隔符）：nodejs22 / python311 / openjdk21 / go1 / php8.2
   *   - base + 分隔符 + 语义后缀：nodejs-lts / rust-msvc / python-nightly
   *   - base + 数字 + 语义后缀：openjdk17-jre 之类（放宽兼容）
   * 一律锚定开头，杜绝 mongodb(中间含 go) / google-chrome(以 go 开头) 等噪音混入。
   */
  function isVersionVariant(name: string, base: string): boolean {
    const n = name.toLowerCase()
    const b = base.toLowerCase()
    if (n === b) return true
    const esc = escapeReMain(b)
    if (new RegExp(`^${esc}[-_.]?\\d+(?:\\.\\d+)*$`).test(n)) return true
    if (new RegExp(`^${esc}[-_](?:${VARIANT_SUFFIXES})$`).test(n)) return true
    if (new RegExp(`^${esc}[-_.]?\\d+(?:\\.\\d+)*[-_](?:${VARIANT_SUFFIXES})$`).test(n)) return true
    return false
  }

  /** 综合关联判定：版本变体 或 命中生态别名表。 */
  function isRelevantPackage(name: string, base: string): boolean {
    if (isVersionVariant(name, base)) return true
    const alias = ECOSYSTEM_ALIASES[base.toLowerCase()]
    return alias ? alias.test(name) : false
  }

  /**
   * 从包名抽取"主版本号"用于排序：nodejs22 → 22；openjdk21 → 21；
   * 主包（同名）→ +Infinity 永远置顶；无数字的别名 → -1 沉底。
   */
  function variantMajor(name: string, base: string): number {
    const b = base.toLowerCase()
    const n = name.toLowerCase()
    if (n === b) return Number.POSITIVE_INFINITY
    const rest = n.startsWith(b) ? n.slice(b.length) : n
    const m = rest.match(/\d+/)
    return m ? parseInt(m[0], 10) : -1
  }

  /** 统一排序：主包优先 → 变体主版本号降序 → 具体版本号降序 → 名称字典序。 */
  function sortVersions(list: AppVersionEntry[], base: string): AppVersionEntry[] {
    return list.sort((a, b) => {
      const ma = variantMajor(a.name, base)
      const mb = variantMajor(b.name, base)
      if (ma !== mb) return mb - ma
      const vc = b.version.localeCompare(a.version, undefined, { numeric: true })
      if (vc !== 0) return vc
      return a.name.localeCompare(b.name)
    })
  }

  /**
   * 鲁棒解析 `scoop search` 原始输出，提取每一行的 name / version / bucket。
   * 兼容两种呈现形态：
   *   1) 表格型（新版 scoop）：分隔线 ---- 之后，列以 2+ 空格切分：Name  Version  Source  Description
   *   2) 分组型（旧版 / 部分镜像）："'main' bucket:" 分组标题下，行首缩进 "name (version)"
   * 自动过滤干扰行：bucket 标题、分隔线、汇总行、空行、"No matches found" 等。
   *
   * @param stdout  scoop search 原始 stdout
   * @param appName 用户点击的软件基名，用于关键字关联过滤（仅保留含该关键字的包）
   */
  function parseSearchVersions(stdout: string, appName: string): AppVersionEntry[] {
    const seen = new Set<string>()
    const result: AppVersionEntry[] = []

    const push = (name: string, version: string, bucket: string) => {
      const cleanName = name.trim()
      const cleanVersion = (version || '').trim()
      const cleanBucket = (bucket || '').trim()
      if (!cleanName || !cleanBucket) return
      // 精准关联：只收"版本变体"或命中生态别名的包，杜绝 mongodb/google-chrome 之类噪音
      if (!isRelevantPackage(cleanName, appName)) return
      // 去重键仅用 name：同名包若在多个 bucket 出现，保留首个（bucket 优先级由输出顺序决定）
      const dedupeKey = cleanName.toLowerCase()
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)
      result.push({ name: cleanName, version: cleanVersion, bucket: cleanBucket })
    }

    const lines = stdout.split('\n')

    // ── 形态判定：是否存在表格分隔线 ----  ----
    let tableHeaderIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (/^-{3,}\s+-{3,}/.test(lines[i].trim())) {
        tableHeaderIdx = i
        break
      }
    }

    if (tableHeaderIdx >= 0) {
      // ── 表格型解析 ──
      for (let i = tableHeaderIdx + 1; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        if (!trimmed) continue
        // 过滤汇总行 / 提示行
        if (/^(Results|No matches|No results|Name\s+Version)/i.test(trimmed)) continue
        // 列以 2+ 空格切分：Name  Version  Source[  Description]
        const fields = trimmed.split(/\s{2,}/)
        if (fields.length < 3) continue
        const [name, version, bucket] = fields
        // 校验 name 合法（排除误入的描述行）
        if (!/^[\w.\-+]+$/.test(name)) continue
        push(name, version, bucket)
      }
      return sortVersions(result, appName)
    }

    // ── 分组型解析（无表格分隔线）──
    // 结构示例：
    //   'main' bucket:
    //       nodejs (26.5.0)
    //       nodejs-lts (24.18.0)
    //
    //   'versions' bucket:
    //       nodejs22 (22.23.1)
    let currentBucket = ''
    const bucketHeader = /^'?([\w.\-+]+)'?\s+bucket:\s*$/i
    const groupLine = /^([\w.\-+]+)\s+\(([^)]+)\)/
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      if (/^-{3,}/.test(line)) continue
      if (/^(No matches|No results)/i.test(line)) continue

      const bh = line.match(bucketHeader)
      if (bh) {
        currentBucket = bh[1]
        continue
      }
      const gl = line.match(groupLine)
      if (gl && currentBucket) {
        push(gl[1], gl[2], currentBucket)
      }
    }
    return sortVersions(result, appName)
  }

  /**
   * 惰性按需同步指定软件的关联版本：
   *   1. 静默执行 scoop search <appName>
   *   2. 鲁棒解析出全量 { name, version, bucket }
   *   3. 覆盖回写 config.appVersionMaps[appName]，返回最新数组
   * 若解析结果为空（如网络异常 / 无匹配），保留旧缓存不覆盖，返回旧缓存兜底。
   */
  ipcMain.handle('scoop:syncAppVersions', async (_event, appName: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-]{0,100}$/.test(appName)) {
      throw new Error('Invalid app name')
    }
    try {
      const { stdout } = await execScoop(`search ${appName}`)
      const versions = parseSearchVersions(stdout, appName)
      if (versions.length === 0) {
        // 解析不到任何版本时不污染缓存，回退旧数据
        return getAppVersionMap(appName)
      }
      setAppVersionMap(appName, versions)
      return versions
    } catch {
      // 执行失败（scoop 未装 / 网络问题）返回旧缓存，保证前端仍有数据可展示
      return getAppVersionMap(appName)
    }
  })

  // 只读取缓存，不触发搜索——供前端"秒开"读取本地已同步的关联版本
  ipcMain.handle('scoop:getAppVersions', async (_event, appName: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-]{0,100}$/.test(appName)) {
      return []
    }
    return getAppVersionMap(appName)
  })

  // Fetch package info (manifest) via scoop cat
  ipcMain.handle('scoop:info', async (_event, name: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}$/.test(name)) {
      throw new Error('Invalid package name')
    }
    try {
      return await execScoopJSON<Record<string, any>>(`cat ${name}`)
    } catch {
      return { description: '' }
    }
  })

  // Dynamic upstream version from Manifest checkver.url, without syncing local buckets.
  ipcMain.handle('scoop:checkverLatest', async (_event, name: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}$/.test(name)) {
      throw new Error('Invalid package name')
    }

    try {
      const manifest = await execScoopJSON<Record<string, any>>(`cat ${name}`)
      const checkver = manifest?.checkver
      const url = resolveCheckverUrl(checkver)

      if (!checkver || !url) {
        return {
          success: false,
          supported: false,
          reason: '此 Manifest 未提供可直接请求的 checkver.url',
        }
      }

      const { text, finalUrl } = await fetchCheckverText(url)
      const version = extractCheckverVersion(text, finalUrl, checkver)

      if (!version) {
        return {
          success: false,
          supported: true,
          url: finalUrl,
          reason: '已请求 checkver.url，但未能解析出版本号',
        }
      }

      return {
        success: true,
        supported: true,
        version,
        url: finalUrl,
      }
    } catch (error: any) {
      return {
        success: false,
        supported: true,
        reason: error?.message || '刷新官方版本失败',
      }
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
    const task = beginScoopTask('install', name, [name])

    try {
      const privilege = await ensureGlobalPrivilege(win, 'install', name, options?.global)
      if (!privilege.ok) {
        sendCommandFailure(win, 'install', name, 'Install', privilege.error)
        sendLogEnd(win, {
          package: name,
          packages: [name],
          success: false,
          code: null,
        })
        return {
          success: false,
          package: name,
          code: null,
          stdout: '',
          stderr: privilege.error,
          error: privilege.error,
        }
      }

      const { stdout, stderr, code, aborted } = await execScoopRaw(args, (data, stream) => {
        sendProgress(win, {
          type: 'install',
          package: name,
          stream,
          message: data,
        })
      }, task.controller.signal, undefined, privilege.useSudo)

      const success = code === 0 && !aborted
      const error = success
        ? undefined
        : normalizeExitError('Install', name, stdout, stderr, code, aborted)

      if (!success && error) {
        sendCommandFailure(win, 'install', name, 'Install', error, aborted)
      }
      sendLogEnd(win, {
        package: name,
        packages: [name],
        success,
        code,
        aborted,
      })

      return {
        success,
        package: name,
        code,
        stdout,
        stderr,
        aborted,
        elevated: privilege.useSudo,
        error,
      }
    } finally {
      finishScoopTask(task, task.controller.signal.aborted ? 'aborted' : 'ended')
    }
  })

  // Reset / activate an installed package version (`scoop reset <appname>`)
  ipcMain.handle('scoop:reset', async (event, name: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-+]{0,100}$/.test(name)) {
      throw new Error('Invalid package name')
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    const { stdout, stderr, code } = await execScoopRaw(['reset', name], (data, stream) => {
      sendProgress(win, {
        type: 'message',
        package: name,
        stream,
        message: data,
      })
    })

    return {
      success: code === 0,
      package: name,
      code,
      stdout,
      stderr,
      error: code === 0 ? undefined : ((stderr || stdout).trim() || `scoop reset exited with code ${code}`),
    }
  })

  // Uninstall a package
  ipcMain.handle('scoop:uninstall', async (event, name: string, global?: boolean) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}$/.test(name)) {
      throw new Error('Invalid package name')
    }
    const args = ['uninstall', name]
    if (global) args.push('--global')
    const win = BrowserWindow.fromWebContents(event.sender)
    const task = beginScoopTask('uninstall', name, [name])

    try {
      const privilege = await ensureGlobalPrivilege(win, 'uninstall', name, global)
      if (!privilege.ok) {
        sendCommandFailure(win, 'uninstall', name, 'Uninstall', privilege.error)
        sendLogEnd(win, {
          package: name,
          packages: [name],
          success: false,
          code: null,
        })
        return {
          success: false,
          package: name,
          code: null,
          stdout: '',
          stderr: privilege.error,
          error: privilege.error,
        }
      }

      const { stdout, stderr, code, aborted } = await execScoopRaw(args, (data, stream) => {
        sendProgress(win, {
          type: 'uninstall',
          package: name,
          stream,
          message: data,
        })
      }, task.controller.signal, undefined, privilege.useSudo)

      const success = code === 0 && !aborted
      const error = success
        ? undefined
        : normalizeExitError('Uninstall', name, stdout, stderr, code, aborted)

      if (!success && error) {
        sendCommandFailure(win, 'uninstall', name, 'Uninstall', error, aborted)
      }
      sendLogEnd(win, {
        package: name,
        packages: [name],
        success,
        code,
        aborted,
      })

      return {
        success,
        package: name,
        code,
        stdout,
        stderr,
        aborted,
        elevated: privilege.useSudo,
        error,
      }
    } finally {
      finishScoopTask(task, task.controller.signal.aborted ? 'aborted' : 'ended')
    }
  })

  // Update packages —— 原生批量：一次 spawn 执行 `scoop update a b c`，日志只做 raw stream 转发
  ipcMain.handle('scoop:update', async (event, target?: string | string[]) => {
    const names = Array.isArray(target) ? target : (target ? [target] : [])
    const invalid = names.find((name) => !/^[a-zA-Z0-9][a-zA-Z0-9._\-/]{0,100}$/.test(name))
    if (invalid) {
      throw new Error(`Invalid package name: ${invalid}`)
    }

    const args = names.length > 0 ? ['update', ...names] : ['update', '--all']
    const win = BrowserWindow.fromWebContents(event.sender)
    const pkgLabel = names.length === 1 ? names[0] : (names.length > 1 ? names.join(' ') : '*')
    const task = beginScoopTask('update', pkgLabel, names)

    try {
      const { stdout, stderr, code, aborted } = await execScoopRaw(args, (data, stream) => {
        sendProgress(win, {
          type: 'update',
          package: pkgLabel,
          stream,
          message: data,
        })
      }, task.controller.signal)

      const success = code === 0 && !aborted
      const diagnostics = extractCommandDiagnostics(stdout, stderr)
      const error = success
        ? undefined
        : normalizeExitError('Update', pkgLabel, stdout, stderr, code, aborted)

      if (!success && error) {
        sendCommandFailure(win, 'update', pkgLabel, 'Update', error, aborted)
      }

      // spawn 进程 close 后，通知渲染层批量命令已结束，触发终态数据刷新
      sendLogEnd(win, {
        package: pkgLabel,
        packages: names,
        success,
        code,
        aborted,
      })

      return {
        success,
        package: pkgLabel,
        packages: names,
        code,
        stdout,
        stderr,
        aborted,
        diagnostics,
        error,
      }
    } finally {
      finishScoopTask(task, task.controller.signal.aborted ? 'aborted' : 'ended')
    }
  })

  // 启动自检：执行 `scoop update`（无参）更新 scoop 自身与所有 buckets，
  // 不更新已安装应用。完成后由前端再跑 scoop status 同步可更新列表。
  ipcMain.handle('scoop:updateSelf', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { stdout, stderr, code } = await execScoop('update', (data) => {
      sendProgress(win, {
        type: 'message',
        package: 'scoop',
        message: data.trim(),
      })
    })
    return { success: code === 0, stdout, stderr }
  })

  // ── 旧版本测量：纯 Node.js（异步并发） ──
  async function getDirSize(dirPath: string): Promise<number> {
    try {
      // 用 git-bash 的 du 直接算目录大小（MiB），绕开 Electron 的 fs，
      // 避免把 .asar 归档当目录递归进入并持有句柄，导致 cleanup 时文件被本进程锁定。
      // du 把 .asar 视为普通文件，不会进入归档内部，既不持锁也能拿到准确大小。
      const msysPath = dirPath.replace(/\\/g, '/')
      const { stdout, code } = await execGitBash(`du -sm "${msysPath}"`)
      if (code !== 0) return 0
      const mb = parseInt(stdout.trim().split(/\s+/)[0], 10)
      if (isNaN(mb)) return 0
      // 转回字节数，保持对外接口（bytes）不变，显示层 MB/GB 旧逻辑无需改动
      return mb * 1024 * 1024
    } catch {
      return 0
    }
  }

  type OldVersionDir = {
    appName: string
    versionName: string
    appDir: string
    dir: string
    currentVersionName: string
  }

  type CleanupSkippedDir = {
    appName: string
    versionName: string
    path: string
    lockedPath?: string
    reason: string
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
  }

  function normalizePathKey(path: string): string {
    return resolve(path).replace(/[\\\/]+$/, '').toLowerCase()
  }

  function isPathInside(parent: string, child: string): boolean {
    const rel = relative(resolve(parent), resolve(child))
    return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
  }

  function isDirectChild(parent: string, child: string): boolean {
    const rel = relative(resolve(parent), resolve(child))
    return !!rel && !rel.startsWith('..') && !isAbsolute(rel) && rel.split(/[\\\/]/).length === 1
  }

  function bashQuote(value: string): string {
    return `'${value.replace(/'/g, `'\''`)}'`
  }

  function toGitBashPath(path: string): string {
    return path.replace(/\\/g, '/')
  }

  function parseLockedPath(text: string): string {
    const patterns = [
      /rm:\s+cannot remove ['"]([^'"]+)['"]:\s*(.+)/i,
      /cannot access the file '([^']+)'/i,
      /process cannot access the file '([^']+)'/i,
      /because it is being used by another process[\s\S]*?'([^']+)'/i,
      /另一个程序正在使用此文件，进程无法访问。?[\s\S]*?'([^']+)'/i,
    ]
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match?.[1]) return match[1]
    }
    return ''
  }

  function getCurrentTarget(_appDir: string, currentPath: string): string | null {
    try {
      return resolve(realpathSync(currentPath))
    } catch {
      return null
    }
  }

  function isSafeOldVersionDir(
    appsDir: string,
    appDir: string,
    versionDir: string,
    currentPath: string,
    currentTarget: string
  ): boolean {
    const appDirResolved = resolve(appDir)
    const versionDirResolved = resolve(versionDir)

    if (!isPathInside(appsDir, appDirResolved)) return false
    if (!isPathInside(appDirResolved, currentTarget)) return false
    if (!isDirectChild(appDirResolved, versionDirResolved)) return false
    if (normalizePathKey(versionDirResolved) === normalizePathKey(currentPath)) return false
    if (normalizePathKey(versionDirResolved) === normalizePathKey(currentTarget)) return false

    return true
  }

  async function getOldVersionDirs(): Promise<OldVersionDir[]> {
    try {
      const scoopRoot = await resolveScoopRoot()
      const appsDir = join(scoopRoot, 'apps')
      if (!existsSync(appsDir)) return []

      const apps = await fsp.readdir(appsDir, { withFileTypes: true })
      const nested = await Promise.all(apps.map(async (app): Promise<OldVersionDir[]> => {
        if (!app.isDirectory()) return []

        const appDir = join(appsDir, app.name)
        const currentPath = join(appDir, 'current')
        const currentTarget = getCurrentTarget(appDir, currentPath)

        // current junction 缺失、破损、或指向 app 目录外时，整包跳过，绝不猜测删除。
        if (!currentTarget || !existsSync(currentTarget) || !isPathInside(appDir, currentTarget)) return []

        const currentVersionName = basename(currentTarget)
        if (!currentVersionName) return []

        const versions = await fsp.readdir(appDir, { withFileTypes: true })
        return versions
          .filter((ver) => {
            if (!ver.isDirectory() || ver.name === 'current') return false
            if (ver.name.toLowerCase() === currentVersionName.toLowerCase()) return false

            const versionDir = join(appDir, ver.name)
            return isSafeOldVersionDir(appsDir, appDir, versionDir, currentPath, currentTarget)
          })
          .map((ver) => ({
            appName: app.name,
            versionName: ver.name,
            appDir,
            dir: join(appDir, ver.name),
            currentVersionName,
          }))
      }))

      return nested.flat()
    } catch {
      return []
    }
  }

  async function getOldVersionTotalBytes(): Promise<number> {
    const oldDirs = await getOldVersionDirs()
    const sizes = await Promise.all(oldDirs.map((item) => getDirSize(item.dir)))
    return sizes.reduce((a, b) => a + b, 0)
  }

  async function removeOldVersionDir(
    item: OldVersionDir,
    win: BrowserWindow | null
  ): Promise<{ success: true } | { success: false; lockedPath?: string; reason: string }> {
    if (!existsSync(item.dir)) return { success: true }

    const maxAttempts = 5
    let lastReason = ''
    let lastLockedPath = ''

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 删除前再取一次 current 目标，防止清理过程中 app 被更新/切换版本。
      const currentTarget = getCurrentTarget(item.appDir, join(item.appDir, 'current'))
      if (!currentTarget) {
        return { success: false, reason: 'current junction 不存在或不可读取，已跳过以避免误删。' }
      }
      if (normalizePathKey(item.dir) === normalizePathKey(currentTarget)) {
        return { success: false, reason: '目标目录已成为 current 版本，已跳过以避免误删。' }
      }

      const quotedPath = bashQuote(toGitBashPath(item.dir))
      const { stdout, stderr, code } = await execGitBash(`rm -rf -- ${quotedPath}`)
      if (!existsSync(item.dir)) return { success: true }

      lastReason = stderr || stdout || `rm exited with code ${code}`
      lastLockedPath = parseLockedPath(lastReason)

      if (attempt < maxAttempts) {
        const lockedHint = lastLockedPath ? `（被占用：${lastLockedPath}）` : ''
        sendProgress(win, {
          type: 'message',
          package: item.appName,
          message: `清理 ${item.appName}@${item.versionName} 遇到文件占用${lockedHint}，稍候重试 ${attempt + 1}/${maxAttempts}…`,
        })
        await sleep(700 * attempt + 500)
      }
    }

    return {
      success: false,
      lockedPath: lastLockedPath || undefined,
      reason: lastReason || '旧版本目录仍存在，已保守跳过。',
    }
  }

  ipcMain.handle('scoop:cleanup', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const beforeBytes = await getOldVersionTotalBytes()
    const oldVersionDirs = await getOldVersionDirs()
    const skipped: CleanupSkippedDir[] = []
    let removedVersions = 0

    // 逐个旧版本目录清理，而不是调用 `scoop cleanup --all`。
    // 原生命令遇到一个被锁目录就整体失败；这里将失败目录记录为 skipped，继续处理其它旧版本。
    for (const item of oldVersionDirs) {
      sendProgress(win, {
        type: 'message',
        package: item.appName,
        message: `正在清理 ${item.appName}@${item.versionName}…`,
      })

      const result = await removeOldVersionDir(item, win)
      if (result.success) {
        removedVersions += 1
        continue
      }

      skipped.push({
        appName: item.appName,
        versionName: item.versionName,
        path: item.dir,
        lockedPath: result.lockedPath,
        reason: result.reason,
      })
      sendProgress(win, {
        type: 'message',
        package: item.appName,
        message: `已跳过 ${item.appName}@${item.versionName}：${result.lockedPath || result.reason}`,
      })
    }

    const afterBytes = await getOldVersionTotalBytes()
    return {
      released: Math.max(0, beforeBytes - afterBytes),
      removedVersions,
      skipped,
    }
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

  // Fast update check: parallel git sync + in-memory manifest comparison.
  ipcMain.handle('scoop:check-updates', async () => {
    return checkScoopUpdatesFast()
  })

  // List updatable packages. Kept for compatibility, now backed by the fast service.
  ipcMain.handle('scoop:listUpdatable', async () => {
    const result = await checkScoopUpdatesFast()
    return result.updates.map(({ name, oldVersion, newVersion }) => ({ name, oldVersion, newVersion }))
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
    /^(?:sudo\s+)?scoop\s+(reset|uninstall|install|update|checkup|cleanup|config|bucket|list|status|search|info|cat|home|prefix|which|shim|export|import|hold|unhold|hold-check|virustotal|help)/i,
    /^(mysqld|nginx|redis-server|redis-cli|node|npm|yarn|pnpm|python|pip|java|javac|gradle|maven|mvn)\s+/i,
    /^(?:sudo\s+)?reg\s+(import|export|add|delete|query|copy|save|load|unload|restore|compare)/i,
    /^shim\s+/i,
    /^(?:sudo\s+)?netsh\s+/i,
    /^(?:sudo\s+)?Set-ExecutionPolicy\s+/i,
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
    if (/(?:&&|\|\||[;|`])/.test(command)) {
      return { safe: false, reason: `命令包含不允许的控制符: ${command}` }
    }

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
