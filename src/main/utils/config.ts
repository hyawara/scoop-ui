import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONFIG_DIR = join(homedir(), '.scoop-ui')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')
const TEMPLATE_PATH = join(__dirname, 'config.default.json')

/** 单个关联版本项：Scoop 内部真实包名 + 版本号 + 所属 bucket */
export interface AppVersionEntry {
  name: string
  version: string
  bucket: string
}

export interface AppConfig {
  discover: {
    multiVersionPrefs: string[]
  }
  /** 惰性按需同步的关联版本缓存：key 为用户点击的软件基名，value 为解析出的全量版本数组 */
  appVersionMaps: Record<string, AppVersionEntry[]>
  packages: {
    selectedPackages: string[]
    pinnedPackages: string[]
  }
  theme: {
    dark: boolean
    fontFamily: string
    fontSize: number
    colorPreset: string
  }
  update: {
    autoCheck: boolean
  }
}

const DEFAULT_CONFIG: AppConfig = {
  discover: {
    multiVersionPrefs: ['openjdk', 'go', 'rust', 'nodejs'],
  },
  appVersionMaps: {},
  packages: {
    selectedPackages: [],
    pinnedPackages: [],
  },
  theme: {
    dark: true,
    fontFamily: "'Segoe UI','Microsoft YaHei','Maple Mono NF','sans-serif'",
    fontSize: 14,
    colorPreset: 'aurora',
  },
  update: {
    autoCheck: true,
  },
}

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function safeParse(json: string): any {
  try { return JSON.parse(json) } catch { return null }
}

function deepMerge(target: any, source: any): any {
  const out = { ...target }
  for (const k of Object.keys(source)) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      out[k] = deepMerge(out[k] || {}, source[k])
    } else {
      out[k] = source[k]
    }
  }
  return out
}

/**
 * 读取 ~/.scoop-ui/config.json。
 * 如果文件不存在，优先从同目录的 config.default.json 模板复制，
 * 模板也不存在则用代码内 DEFAULT_CONFIG。
 */
export function readConfig(): AppConfig {
  ensureDir()
  if (!existsSync(CONFIG_PATH)) {
    if (existsSync(TEMPLATE_PATH)) {
      const templateRaw = readFileSync(TEMPLATE_PATH, 'utf-8')
      writeFileSync(CONFIG_PATH, templateRaw, 'utf-8')
      const parsed = safeParse(templateRaw)
      if (parsed) return deepMerge(DEFAULT_CONFIG, parsed)
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8')
    return { ...DEFAULT_CONFIG }
  }
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return deepMerge(DEFAULT_CONFIG, parsed)
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeConfig(config: AppConfig): void {
  ensureDir()
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

export function getConfigPath(path?: string): any {
  const config = readConfig()
  if (!path) return config
  const keys = path.split('.')
  let val: any = config
  for (const k of keys) {
    if (val === undefined || val === null) return undefined
    val = val[k]
  }
  return val
}

export function setConfigPath(path: string, value: any): void {
  const config = readConfig()
  const keys = path.split('.')
  let obj: any = config
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in obj)) obj[keys[i]] = {}
    obj = obj[keys[i]]
  }
  obj[keys[keys.length - 1]] = value
  writeConfig(config)
}

/**
 * 读取指定软件基名的关联版本缓存。无缓存时返回空数组。
 * @param appName 用户点击查看详情的软件基名（如 nodejs / openjdk）
 */
export function getAppVersionMap(appName: string): AppVersionEntry[] {
  const config = readConfig()
  const maps = config.appVersionMaps || {}
  const entry = maps[appName]
  return Array.isArray(entry) ? entry : []
}

/**
 * 覆盖写入指定软件基名的关联版本数组（全量替换，确保拿到最新数据）。
 * 只读改一次配置，避免并发写入丢失其它 key。
 * @param appName  软件基名
 * @param versions 解析出的最新全量版本数组
 */
export function setAppVersionMap(appName: string, versions: AppVersionEntry[]): void {
  const config = readConfig()
  if (!config.appVersionMaps || typeof config.appVersionMaps !== 'object') {
    config.appVersionMaps = {}
  }
  config.appVersionMaps[appName] = versions
  writeConfig(config)
}
