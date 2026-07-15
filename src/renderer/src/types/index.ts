export interface PackageInfo {
  name: string
  version: string
  description?: string
  website?: string
  license?: string
  bucket?: string
  global?: boolean
  installed?: boolean
  updatable?: boolean
  newVersion?: string
  engine?: 'scoop-search' | 'native'
}

export interface UpdatableInfo {
  name: string
  oldVersion: string
  newVersion: string
  latestVersion?: string
  bucket?: string
  global?: boolean
  hasUpdate?: boolean
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

export interface InstallOptions {
  global?: boolean
  /** 跳过哈希校验，等价于 scoop install --skip-hash-check。 */
  skipCheck?: boolean
  independent?: boolean
  /** 跳过 Scoop 自更新，避免安装动作被源同步阻塞；默认开启。 */
  noUpdateScoop?: boolean
}

export interface ScoopSourceStatus {
  lastUpdate?: string
  lastUpdateMs?: number
  ageMs?: number
  intervalMs: number
  stale: boolean
  nextUpdateAt?: string
  checkedAt: string
  error?: string
}

export interface ScoopSourceSyncResult {
  success: boolean
  skipped: boolean
  reason?: 'fresh' | 'busy' | 'running'
  status: ScoopSourceStatus
  code?: number | null
  stdout: string
  stderr: string
  aborted?: boolean
  error?: string
}

export interface CheckUpdatesOptions {
  syncBuckets?: boolean
}

export interface ScoopCommandResult {
  success: boolean
  package: string
  packages?: string[]
  code?: number | null
  stdout: string
  stderr: string
  aborted?: boolean
  elevated?: boolean
  error?: string
}

export interface ProgressData {
  type: 'download' | 'install' | 'uninstall' | 'update' | 'message'
  package: string
  percent?: number
  message: string
  stream?: 'stdout' | 'stderr'
}

export interface CacheInfo {
  size: number
  unit: string
  files: number
}

export interface ScoopEnv {
  scoop: string
  global: string
}

export interface ScoopStatus {
  installed: boolean
  path?: string
  checking: boolean
}

export interface ProxyConfig {
  enabled: boolean
  address: string
  type: 'http' | 'socks5'
}

export interface AppVersion {
  version: string
  bucket: string
  manifestName: string
  isInstalled: boolean
}

/**
 * 关联版本缓存项：与主进程 config.ts 的 AppVersionEntry 结构一致。
 * 存储在 ~/.scoop-ui/config.json 的 appVersionMaps[appName] 数组下。
 */
export interface AppVersionEntry {
  name: string
  version: string
  bucket: string
}

export interface DiscoverApp {
  id: string
  name: string
  description: string
  icon: string
  gradient: string
  website?: string
  versions: AppVersion[]
}
