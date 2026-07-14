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
  skipCheck?: boolean
  independent?: boolean
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
