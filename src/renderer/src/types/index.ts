export interface PackageInfo {
  name: string
  version: string
  description: string
  website?: string
  license?: string
  bucket?: string
  global?: boolean
  installed: boolean
  updatable?: boolean
  newVersion?: string
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
}

export interface CacheInfo {
  size: number
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
  size?: string
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
