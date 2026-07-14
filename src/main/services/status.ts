import { execFile } from 'child_process'
import { promises as fsp } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'

export interface FastInstalledApp {
  name: string
  version: string
  bucket: string
  global: boolean
  manifestPath?: string
  installedUpdatedAt?: string
}

export interface FastUpdateInfo {
  name: string
  oldVersion: string
  newVersion: string
  latestVersion: string
  bucket: string
  global: boolean
  hasUpdate: true
}

export interface BucketSyncResult {
  bucket: string
  path: string
  ok: boolean
  message?: string
}

export interface ManifestChangedInfo {
  name: string
  installedVersion: string
  latestVersion: string
  bucket: string
  global: boolean
  latestUpdatedAt?: string
  installedUpdatedAt?: string
  reason: 'version-compare-unknown' | 'manifest-newer-than-installed'
}

export interface SkippedUpdateInfo {
  name: string
  installedVersion: string
  latestVersion: string
  bucket: string
  global: boolean
  latestUpdatedAt?: string
  installedUpdatedAt?: string
  reason: 'latest-older-than-installed' | 'normalized-version-equal' | 'manifest-not-newer-than-installed'
}

export interface CheckUpdatesResult {
  updates: FastUpdateInfo[]
  changed: ManifestChangedInfo[]
  skipped: SkippedUpdateInfo[]
  installed: FastInstalledApp[]
  bucketResults: BucketSyncResult[]
  warnings: string[]
  elapsedMs: number
}

interface BucketRepo {
  name: string
  path: string
}

interface LatestManifest {
  version: string
  bucket: string
  bucketPath: string
  manifestPath: string
  relativePath: string
}

type VersionToken =
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }

const TEXT_VERSION_WEIGHT: Record<string, number> = {
  dev: -50,
  devel: -50,
  nightly: -45,
  snapshot: -45,
  alpha: -40,
  a: -40,
  beta: -30,
  b: -30,
  pre: -20,
  preview: -20,
  rc: -10,
  stable: 0,
  release: 0,
  final: 0,
}

function tokenizeVersion(version: string): VersionToken[] {
  const normalized = version.trim().replace(/^[vV](?=\d)/, '')
  const matches = normalized.match(/\d+|[a-zA-Z]+/g) || []
  return matches.map((part) => {
    if (/^\d+$/.test(part)) {
      return { kind: 'number', value: Number(part) }
    }
    return { kind: 'text', value: part.toLowerCase() }
  })
}

function compareMissingWithToken(token: VersionToken): number | null {
  if (token.kind === 'number') return token.value === 0 ? 0 : -1
  // 没有预发布后缀的稳定版大于 alpha/beta/rc 等文本后缀。
  const weight = TEXT_VERSION_WEIGHT[token.value]
  if (weight === undefined) return null
  return weight < 0 ? 1 : 0
}

function compareTextToken(a: string, b: string): number | null {
  if (a === b) return 0
  const left = TEXT_VERSION_WEIGHT[a]
  const right = TEXT_VERSION_WEIGHT[b]
  if (left === undefined || right === undefined) return null
  return left === right ? 0 : left > right ? 1 : -1
}

function compareVersionLike(a: string, b: string): number | null {
  const left = tokenizeVersion(a)
  const right = tokenizeVersion(b)
  if (!left.some(token => token.kind === 'number') || !right.some(token => token.kind === 'number')) {
    return null
  }

  const max = Math.max(left.length, right.length)
  for (let index = 0; index < max; index++) {
    const aToken = left[index]
    const bToken = right[index]
    if (!aToken && !bToken) return 0
    if (!aToken && bToken) {
      const compared = compareMissingWithToken(bToken)
      if (compared === null) return null
      if (compared !== 0) return compared
      continue
    }
    if (aToken && !bToken) {
      const missingCompared = compareMissingWithToken(aToken)
      if (missingCompared === null) return null
      const compared = -missingCompared
      if (compared !== 0) return compared
      continue
    }
    if (!aToken || !bToken) continue

    if (aToken.kind === 'number' && bToken.kind === 'number') {
      if (aToken.value !== bToken.value) return aToken.value > bToken.value ? 1 : -1
      continue
    }
    if (aToken.kind === 'text' && bToken.kind === 'text') {
      const compared = compareTextToken(aToken.value, bToken.value)
      if (compared === null) return null
      if (compared !== 0) return compared
      continue
    }
    return null
  }

  return 0
}

function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

async function exists(path: string): Promise<boolean> {
  try {
    await fsp.access(path)
    return true
  } catch {
    return false
  }
}

async function readJson<T extends Record<string, any>>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(path, 'utf-8')) as T
  } catch {
    return null
  }
}

async function readFileMtimeIso(path: string): Promise<string | undefined> {
  try {
    return (await fsp.stat(path)).mtime.toISOString()
  } catch {
    return undefined
  }
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(path, { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink()).map(entry => entry.name)
  } catch {
    return []
  }
}

async function resolveScoopRootFast(): Promise<string> {
  const candidates = [
    process.env['SCOOP'],
    join(homedir(), 'scoop'),
  ].filter(Boolean).map(path => expandHomePath(path as string))

  for (const candidate of candidates) {
    if (await exists(join(candidate, 'apps'))) return candidate
  }

  // 兼容 ~/install/scoop 之类的非默认安装：只扫用户目录下一层，避免慢遍历。
  for (const dir of await listDirs(homedir())) {
    const candidate = join(homedir(), dir, 'scoop')
    if (await exists(join(candidate, 'apps'))) return candidate
  }

  return join(homedir(), 'scoop')
}

function resolveGlobalRoots(scoopRoot: string): string[] {
  const roots = [
    process.env['SCOOP_GLOBAL'],
    join(scoopRoot, 'global'),
    join(process.env['PROGRAMDATA'] || 'C:\\ProgramData', 'scoop'),
  ].filter(Boolean).map(path => expandHomePath(path as string))

  return [...new Set(roots)]
}

function execGit(args: string[], cwd: string, timeout = 30_000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd,
      windowsHide: true,
      timeout,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || ''),
        stderr: String(stderr || (error?.message ?? '')),
      })
    })
  })
}

async function readManifestCommitDate(latest: LatestManifest): Promise<string | undefined> {
  const result = await execGit(['log', '-1', '--format=%cI', '--', latest.relativePath], latest.bucketPath, 10_000)
  const value = result.stdout.trim()
  return result.ok && value ? value : await readFileMtimeIso(latest.manifestPath)
}

async function listBucketRepos(scoopRoot: string): Promise<BucketRepo[]> {
  const bucketsRoot = join(scoopRoot, 'buckets')
  const dirs = await listDirs(bucketsRoot)
  const repos: BucketRepo[] = []

  for (const dir of dirs) {
    const path = join(bucketsRoot, dir)
    if (await exists(join(path, 'bucket'))) {
      repos.push({ name: dir, path })
    }
  }

  return repos
}

async function syncBucket(bucket: BucketRepo): Promise<BucketSyncResult> {
  const fetch = await execGit(['fetch', '--all', '--prune'], bucket.path, 45_000)
  if (!fetch.ok) {
    return {
      bucket: bucket.name,
      path: bucket.path,
      ok: false,
      message: (fetch.stderr || fetch.stdout || 'git fetch 失败').trim(),
    }
  }

  const upstream = await execGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], bucket.path, 10_000)
  const upstreamRef = upstream.stdout.trim()
  if (!upstream.ok || !upstreamRef) {
    return {
      bucket: bucket.name,
      path: bucket.path,
      ok: true,
      message: '已 fetch；未配置 upstream，跳过快进合并',
    }
  }

  const merge = await execGit(['merge', '--ff-only', upstreamRef], bucket.path, 30_000)
  if (!merge.ok) {
    return {
      bucket: bucket.name,
      path: bucket.path,
      ok: false,
      message: (merge.stderr || merge.stdout || 'bucket 无法快进合并').trim(),
    }
  }

  return {
    bucket: bucket.name,
    path: bucket.path,
    ok: true,
    message: (merge.stdout || '已同步').trim(),
  }
}

async function readInstallBucket(appDir: string): Promise<string> {
  const installJson = await readJson<Record<string, any>>(join(appDir, 'current', 'install.json'))
  const candidates = [
    installJson?.bucket,
    installJson?.source,
    installJson?.manifest?.bucket,
    installJson?.manifest?.source,
  ].filter(value => typeof value === 'string') as string[]

  for (const value of candidates) {
    const normalized = basename(value.replace(/\\/g, '/')).replace(/\.json$/i, '')
    if (normalized && normalized !== 'bucket') return normalized
  }

  return ''
}

async function readInstalledFromRoot(root: string, global: boolean): Promise<FastInstalledApp[]> {
  const appsRoot = join(root, 'apps')
  const names = await listDirs(appsRoot)
  const apps = await Promise.all(names.map(async (name): Promise<FastInstalledApp | null> => {
    const appDir = join(appsRoot, name)
    const manifestPath = join(appDir, 'current', 'manifest.json')
    const manifest = await readJson<Record<string, any>>(manifestPath)
    const version = typeof manifest?.version === 'string' ? manifest.version.trim() : ''
    if (!version) return null

    const bucketFromManifest = [
      manifest?.bucket,
      manifest?.source,
      manifest?._bucket,
      manifest?._source,
    ].find(value => typeof value === 'string') as string | undefined

    return {
      name,
      version,
      bucket: bucketFromManifest || await readInstallBucket(appDir),
      global,
      manifestPath,
      installedUpdatedAt: await readFileMtimeIso(manifestPath),
    }
  }))

  return apps.filter((app): app is FastInstalledApp => app !== null)
}

async function readInstalledApps(scoopRoot: string): Promise<FastInstalledApp[]> {
  const roots = [scoopRoot, ...resolveGlobalRoots(scoopRoot)]
  const uniqueRoots = [...new Set(roots)]
  const groups = await Promise.all(uniqueRoots.map(async (root) => {
    if (!await exists(join(root, 'apps'))) return []
    return readInstalledFromRoot(root, root !== scoopRoot)
  }))

  const seen = new Set<string>()
  const result: FastInstalledApp[] = []
  for (const app of groups.flat()) {
    const key = `${app.global ? 'global' : 'user'}:${app.name}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(app)
  }
  return result
}

async function readLatestManifest(app: FastInstalledApp, buckets: BucketRepo[]): Promise<LatestManifest | null> {
  const preferred = app.bucket
    ? buckets.find(bucket => bucket.name.toLowerCase() === app.bucket.toLowerCase())
    : null
  const ordered = preferred
    ? [preferred, ...buckets.filter(bucket => bucket !== preferred)]
    : buckets

  for (const bucket of ordered) {
    const relativePath = `bucket/${app.name}.json`
    const manifestPath = join(bucket.path, 'bucket', `${app.name}.json`)
    const manifest = await readJson<Record<string, any>>(manifestPath)
    const version = typeof manifest?.version === 'string' ? manifest.version.trim() : ''
    if (version) {
      return { version, bucket: bucket.name, bucketPath: bucket.path, manifestPath, relativePath }
    }
  }

  return null
}

function isIsoAfter(left?: string, right?: string): boolean {
  if (!left || !right) return false
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime > rightTime
}

type ClassifiedVersionChange =
  | { kind: 'update'; value: FastUpdateInfo }
  | { kind: 'changed'; value: ManifestChangedInfo }
  | { kind: 'skipped'; value: SkippedUpdateInfo }
  | { kind: 'none' }

async function classifyVersionChange(app: FastInstalledApp, latest: LatestManifest): Promise<ClassifiedVersionChange> {
  if (app.version === latest.version) return { kind: 'none' }

  const compared = compareVersionLike(latest.version, app.version)
  if (compared !== null) {
    if (compared > 0) {
      return {
        kind: 'update',
        value: {
          name: app.name,
          oldVersion: app.version,
          newVersion: latest.version,
          latestVersion: latest.version,
          bucket: latest.bucket,
          global: app.global,
          hasUpdate: true as const,
        },
      }
    }

    if (compared < 0) {
      return {
        kind: 'skipped',
        value: {
          name: app.name,
          installedVersion: app.version,
          latestVersion: latest.version,
          bucket: latest.bucket,
          global: app.global,
          installedUpdatedAt: app.installedUpdatedAt,
          reason: 'latest-older-than-installed',
        },
      }
    }

    return {
      kind: 'skipped',
      value: {
        name: app.name,
        installedVersion: app.version,
        latestVersion: latest.version,
        bucket: latest.bucket,
        global: app.global,
        installedUpdatedAt: app.installedUpdatedAt,
        reason: 'normalized-version-equal',
      },
    }
  }

  const latestUpdatedAt = await readManifestCommitDate(latest)
  if (isIsoAfter(latestUpdatedAt, app.installedUpdatedAt)) {
    return {
      kind: 'changed',
      value: {
        name: app.name,
        installedVersion: app.version,
        latestVersion: latest.version,
        bucket: latest.bucket,
        global: app.global,
        latestUpdatedAt,
        installedUpdatedAt: app.installedUpdatedAt,
        reason: 'manifest-newer-than-installed',
      },
    }
  }

  return {
    kind: 'skipped',
    value: {
      name: app.name,
      installedVersion: app.version,
      latestVersion: latest.version,
      bucket: latest.bucket,
      global: app.global,
      latestUpdatedAt,
      installedUpdatedAt: app.installedUpdatedAt,
      reason: 'manifest-not-newer-than-installed',
    },
  }
}

export async function checkScoopUpdatesFast(): Promise<CheckUpdatesResult> {
  const startedAt = Date.now()
  const scoopRoot = await resolveScoopRootFast()
  const buckets = await listBucketRepos(scoopRoot)
  const bucketResults = await Promise.all(buckets.map(syncBucket))
  const installed = await readInstalledApps(scoopRoot)

  const latestPairs = await Promise.all(installed.map(async (app) => ({
    app,
    latest: await readLatestManifest(app, buckets),
  })))

  const classified = await Promise.all(
    latestPairs
      .filter((pair): pair is { app: FastInstalledApp; latest: LatestManifest } => pair.latest !== null)
      .map(({ app, latest }) => classifyVersionChange(app, latest))
  )

  const updates = classified
    .filter((item): item is { kind: 'update'; value: FastUpdateInfo } => item.kind === 'update')
    .map(item => item.value)
    .sort((a, b) => a.name.localeCompare(b.name))

  const changed = classified
    .filter((item): item is { kind: 'changed'; value: ManifestChangedInfo } => item.kind === 'changed')
    .map(item => item.value)
    .sort((a, b) => a.name.localeCompare(b.name))

  const skipped = classified
    .filter((item): item is { kind: 'skipped'; value: SkippedUpdateInfo } => item.kind === 'skipped')
    .map(item => item.value)
    .sort((a, b) => a.name.localeCompare(b.name))

  const warnings = bucketResults
    .filter(result => !result.ok)
    .map(result => `${result.bucket}: ${result.message || '同步失败'}`)

  return {
    updates,
    changed,
    skipped,
    installed,
    bucketResults,
    warnings,
    elapsedMs: Date.now() - startedAt,
  }
}
