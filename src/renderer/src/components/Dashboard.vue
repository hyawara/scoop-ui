<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted, nextTick, watch, inject } from 'vue'
import {
  NCard,
  NTabs,
  NTabPane,
  NButton,
  NIcon,
  NEmpty,
  NScrollbar,
  NModal,
  NCheckbox,
  NSpin,
  useMessage,
  useDialog,
} from 'naive-ui'
import {
  DownloadOutline,
  TrashOutline,
  CubeOutline,
  Cube,
  TerminalOutline,
  CodeSlashOutline,
  CreateOutline,
  ColorPaletteOutline,
  SpeedometerOutline,
  FlashOutline,
  RefreshOutline,
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import { useSettingsStore } from '@/stores/settings'
import StorageEnvCard from '@/components/StorageEnvCard.vue'

import AppListItem from '@/components/AppListItem.vue'
import BucketDrawer from '@/components/BucketDrawer.vue'
import AppDiscoverDrawer from '@/components/AppDiscoverDrawer.vue'
import AppDetailDrawer, { type AppDetailPayload } from '@/components/AppDetailDrawer.vue'
import { usePackageProgress } from '@/composables/usePackageProgress'
import { useSourceSyncPreflight } from '@/composables/useSourceSyncPreflight'
import {
  buildMultiVersionIndex,
  getMultiVersionFamily as getIndexedMultiVersionFamily,
  isMultiVersionApp as isIndexedMultiVersionApp,
  type MultiVersionIndex,
} from '@/utils/multiVersion'
import type { DiscoverApp, AppVersion, AppVersionEntry, InstallOptions } from '@/types'

const packagesStore = usePackagesStore()
const settingsStore = useSettingsStore()
const message = useMessage()
const dialog = useDialog()

// 批量卸载弹窗引用，用于手动关闭
const batchUninstallDialogReforge = ref<ReturnType<typeof dialog.warning> | null>(null)

// 行内进度系统
const pkgProgress = usePackageProgress()
const { ensureSourceReadyBeforeCommand } = useSourceSyncPreflight()
const openTerminal = inject<() => void>('openTerminal', () => {})
const nativeUpdateCount = ref(0)


// 图标缓存
const iconMap = ref<Record<string, string | null>>({})
const iconFetching = ref<Set<string>>(new Set())

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

const updatableNames = computed(() =>
  new Set(packagesStore.updatable.map((p: any) => p.name))
)

const manifestChangedNames = computed(() =>
  new Set(packagesStore.manifestChanged.map((p: any) => p.name))
)

function getNewVersion(name: string): string {
  const pkg = packagesStore.updatable.find((p: any) => p.name === name)
  return pkg?.newVersion || ''
}

function getChangedVersion(name: string): string {
  const pkg = packagesStore.manifestChanged.find((p: any) => p.name === name)
  return pkg?.latestVersion || ''
}

// ═══ 商店分类系统 ═══
interface StoreApp {
  name: string
  icon: string
  desc: string
  gradient: string
  multiVersion?: boolean
}

interface Category {
  id: string
  name: string
  icon: any
  apps: StoreApp[]
}

function withMV(app: StoreApp, mv: boolean): StoreApp {
  return { ...app, multiVersion: mv }
}

const activeCategoryId = ref('featured')

const categories: Category[] = [
  {
    id: 'featured',
    name: '精选推荐',
    icon: FlashOutline,
    apps: [
      { name: 'git', icon: 'G', desc: '分布式版本控制', gradient: 'from-orange-500 to-red-500' },
      { name: 'curl', icon: 'C', desc: '命令行 HTTP 客户端', gradient: 'from-green-500 to-teal-500' },
      { name: 'neovim', icon: 'N', desc: '终端文本编辑器', gradient: 'from-green-600 to-emerald-600' },
      { name: 'fzf', icon: 'F', desc: '模糊搜索利器', gradient: 'from-purple-500 to-pink-500' },
      { name: '7zip', icon: '7', desc: '高压缩率归档工具', gradient: 'from-yellow-500 to-amber-500' },
      withMV({ name: 'nodejs', icon: 'N', desc: 'JavaScript 运行时', gradient: 'from-lime-500 to-green-500' }, true),
    ],
  },
  {
    id: 'dev',
    name: '程序开发',
    icon: CodeSlashOutline,
    apps: [
      { name: 'git', icon: 'G', desc: '分布式版本控制', gradient: 'from-orange-500 to-red-500' },
      { name: 'python', icon: 'P', desc: '通用编程语言', gradient: 'from-blue-500 to-yellow-400' },
      withMV({ name: 'nodejs', icon: 'N', desc: 'JavaScript 运行时', gradient: 'from-lime-500 to-green-500' }, true),
      withMV({ name: 'openjdk', icon: 'J', desc: 'Java 开发工具包', gradient: 'from-red-500 to-orange-500' }, true),
      withMV({ name: 'go', icon: 'G', desc: 'Go 编程语言', gradient: 'from-cyan-500 to-blue-500' }, true),
      withMV({ name: 'rust', icon: 'R', desc: '系统编程语言', gradient: 'from-orange-600 to-amber-600' }, true),
      { name: 'docker-desktop', icon: 'D', desc: '容器化平台', gradient: 'from-blue-500 to-cyan-400' },
      { name: 'visual-studio-code', icon: 'V', desc: '代码编辑器', gradient: 'from-blue-600 to-indigo-500' },
    ],
  },
  {
    id: 'terminal',
    name: '终端工具',
    icon: TerminalOutline,
    apps: [
      { name: 'fzf', icon: 'F', desc: '命令行模糊搜索', gradient: 'from-purple-500 to-pink-500' },
      { name: 'oh-my-posh', icon: 'O', desc: '终端提示符主题', gradient: 'from-teal-500 to-cyan-500' },
      { name: 'zoxide', icon: 'Z', desc: '智能 cd 命令', gradient: 'from-violet-500 to-purple-500' },
      { name: 'bat', icon: 'B', desc: '带语法高亮的 cat', gradient: 'from-yellow-500 to-amber-500' },
      { name: 'ripgrep', icon: 'R', desc: '极速文本搜索', gradient: 'from-red-500 to-rose-500' },
      { name: 'eza', icon: 'E', desc: '现代化 ls 替代', gradient: 'from-green-500 to-emerald-500' },
      { name: 'delta', icon: 'D', desc: '美化 git diff', gradient: 'from-blue-500 to-indigo-500' },
      { name: 'windows-terminal', icon: 'W', desc: '现代终端模拟器', gradient: 'from-slate-500 to-gray-500' },
    ],
  },
  {
    id: 'editors',
    name: '文本编辑',
    icon: CreateOutline,
    apps: [
      { name: 'neovim', icon: 'N', desc: '终端文本编辑器', gradient: 'from-green-600 to-emerald-600' },
      { name: 'visual-studio-code', icon: 'V', desc: '代码编辑器', gradient: 'from-blue-600 to-indigo-500' },
      { name: 'obsidian', icon: 'O', desc: '知识管理笔记', gradient: 'from-purple-600 to-violet-500' },
      { name: 'notepadnext', icon: 'N', desc: 'Notepad++ 跨平台替代', gradient: 'from-blue-500 to-cyan-500' },
      { name: 'sublime-text', icon: 'S', desc: '极速文本编辑器', gradient: 'from-orange-500 to-yellow-500' },
      { name: 'helix', icon: 'H', desc: '后现代终端编辑器', gradient: 'from-rose-500 to-pink-500' },
    ],
  },
  {
    id: 'design',
    name: '图形设计',
    icon: ColorPaletteOutline,
    apps: [
      { name: 'imageglass', icon: 'I', desc: '轻量图片查看器', gradient: 'from-cyan-500 to-blue-500' },
      { name: 'blender', icon: 'B', desc: '3D 建模与渲染', gradient: 'from-orange-500 to-yellow-500' },
      { name: 'gimp', icon: 'G', desc: '开源图像编辑器', gradient: 'from-red-500 to-pink-500' },
      { name: 'inkscape', icon: 'I', desc: '矢量图形编辑器', gradient: 'from-blue-500 to-purple-500' },
      { name: 'sharex', icon: 'S', desc: '截图与录屏工具', gradient: 'from-green-500 to-teal-500' },
      { name: 'chafa', icon: 'C', desc: '终端图像渲染', gradient: 'from-violet-500 to-indigo-500' },
    ],
  },
  {
    id: 'utils',
    name: '系统效率',
    icon: SpeedometerOutline,
    apps: [
      { name: '7zip', icon: '7', desc: '高压缩率归档工具', gradient: 'from-yellow-500 to-amber-500' },
      { name: 'powertoys', icon: 'P', desc: 'Windows 效率工具集', gradient: 'from-blue-500 to-indigo-500' },
      { name: 'everything', icon: 'E', desc: '极速文件搜索', gradient: 'from-cyan-500 to-teal-500' },
      { name: 'trafficmonitor', icon: 'T', desc: '网速与系统监控', gradient: 'from-green-500 to-emerald-500' },
      { name: 'nilesoft-shell', icon: 'N', desc: '右键菜单增强', gradient: 'from-purple-500 to-violet-500' },
    ],
  },
]

const activeCategory = computed(() =>
  categories.find((c) => c.id === activeCategoryId.value) || categories[0]
)

// 图标获取
async function fetchIcon(name: string) {
  if (iconMap.value[name] !== undefined || iconFetching.value.has(name)) return
  iconFetching.value = new Set(iconFetching.value).add(name)
  try {
    const result = await window.scoopAPI.getAppIcon(name)
    iconMap.value = { ...iconMap.value, [name]: result.icon || null }
  } catch {
    iconMap.value = { ...iconMap.value, [name]: null }
  } finally {
    const next = new Set(iconFetching.value)
    next.delete(name)
    iconFetching.value = next
  }
}

function getIcon(name: string): string | null {
  return iconMap.value[name] ?? null
}

// 批量预加载已安装软件的图标（异步，不阻塞 UI）
function preloadIcons() {
  const names = packagesStore.installed.map((p: any) => p.name)
  // 限制并发 5 个，避免过多 PowerShell 进程
  const concurrency = 5
  let idx = 0
  function next() {
    if (idx >= names.length) return
    const name = names[idx++]
    fetchIcon(name).then(() => next())
  }
  for (let i = 0; i < Math.min(concurrency, names.length); i++) {
    next()
  }
}

// ═══ 多版本发现数据 ═══
const discoverLoading = ref(false)
// 后台静默同步态：缓存已展示、正在向 scoop search 拉取最新版本时为 true（驱动抽屉右上角微型转圈）
const discoverRefreshing = ref(false)
const multiVersionIndex = ref<MultiVersionIndex>(buildMultiVersionIndex(null))
const resettingSet = ref<Set<string>>(new Set())
const activeVersionByFamily = ref<Record<string, string>>({})

async function loadAppVersionMaps() {
  try {
    const maps = await window.scoopAPI.getConfig('appVersionMaps')
    multiVersionIndex.value = buildMultiVersionIndex(maps)
  } catch {
    multiVersionIndex.value = buildMultiVersionIndex(null)
  }
}

function getMultiVersionFamily(appName: string): string | null {
  return getIndexedMultiVersionFamily(appName, multiVersionIndex.value)
}

function isMultiVersionApp(appName: string): boolean {
  return isIndexedMultiVersionApp(appName, multiVersionIndex.value)
}

function getActiveVersionForFamily(familyKey?: string | null): string | null {
  if (!familyKey) return null
  return activeVersionByFamily.value[familyKey] || null
}

function isActiveMultiVersionApp(appName: string): boolean {
  const familyKey = getMultiVersionFamily(appName)
  return !!familyKey && getActiveVersionForFamily(familyKey) === appName
}

const appWebsites: Record<string, string> = {
  'git': 'https://git-scm.com/',
  'curl': 'https://curl.se/',
  'neovim': 'https://neovim.io/',
  'fzf': 'https://github.com/junegunn/fzf',
  '7zip': 'https://www.7-zip.org/',
  'nodejs': 'https://nodejs.org/',
  'python': 'https://www.python.org/',
  'openjdk': 'https://openjdk.org/',
  'go': 'https://go.dev/',
  'rust': 'https://www.rust-lang.org/',
  'docker-desktop': 'https://www.docker.com/',
  'visual-studio-code': 'https://code.visualstudio.com/',
  'oh-my-posh': 'https://ohmyposh.dev/',
  'zoxide': 'https://github.com/ajeetdsouza/zoxide',
  'bat': 'https://github.com/sharkdp/bat',
  'ripgrep': 'https://github.com/BurntSushi/ripgrep',
  'eza': 'https://eza.rocks/',
  'delta': 'https://github.com/dandavison/delta',
  'windows-terminal': 'https://github.com/microsoft/terminal',
  'obsidian': 'https://obsidian.md/',
  'notepadnext': 'https://github.com/dail8859/NotepadNext',
  'sublime-text': 'https://www.sublimetext.com/',
  'helix': 'https://helix-editor.com/',
  'imageglass': 'https://imageglass.org/',
  'blender': 'https://www.blender.org/',
  'gimp': 'https://www.gimp.org/',
  'inkscape': 'https://inkscape.org/',
  'sharex': 'https://getsharex.com/',
  'chafa': 'https://hpjansson.org/chafa/',
  'powertoys': 'https://github.com/microsoft/PowerToys',
  'everything': 'https://www.voidtools.com/',
  'trafficmonitor': 'https://github.com/zhongyang219/TrafficMonitor',
  'nilesoft-shell': 'https://nilesoft.org/',
  'scoop': 'https://scoop.sh/',
}

// ═══ 多版本偏好开关（config.json 持久化，双向同步） ═══
const multiVersionPref = ref<string[]>([])
async function loadMVPrefs() {
  try {
    const prefs = await window.scoopAPI.getConfig('discover.multiVersionPrefs')
    if (Array.isArray(prefs)) multiVersionPref.value = prefs
  } catch { /* ignore */ }
  // 补写分类标记 multiVersion 但 config 里没记录的项
  const allApps = categories.flatMap(c => c.apps)
  const set = new Set(multiVersionPref.value)
  let changed = false
  for (const app of allApps) {
    if (app.multiVersion && !set.has(app.name)) {
      set.add(app.name)
      changed = true
    }
  }
  if (changed) {
    multiVersionPref.value = [...set]
    window.scoopAPI.setConfig('discover.multiVersionPrefs', [...set])
  }
}
function getMVEnabled(app: StoreApp): boolean {
  return multiVersionPref.value.includes(app.name)
}
async function toggleMV(app: StoreApp) {
  const set = new Set(multiVersionPref.value)
  const enabling = !set.has(app.name)
  if (enabling) set.add(app.name)
  else set.delete(app.name)
  multiVersionPref.value = [...set]
  await window.scoopAPI.setConfig('discover.multiVersionPrefs', [...set])
  if (enabling) {
    // 开启多版本 → 后台静默 syncAppVersions（scoop search → 解析 → 回写
    // config.appVersionMaps[app.name]），下次打开抽屉即命中缓存秒开。
    // 不强制弹抽屉，避免打断浏览；如需即时查看，点卡片或魔方图标打开抽屉。
    prefetchAppVersions(app)
  }
}

/**
 * 静默预取指定软件的关联版本并回写配置。
 * 供"开启多版本"时调用——解析一次即缓存，下次打开秒开。
 * 若抽屉此刻恰好正展示此软件，顺带无缝刷新其版本列表。
 */
async function prefetchAppVersions(app: StoreApp) {
  try {
    const latest = await window.scoopAPI.syncAppVersions(app.name)
    const count = Array.isArray(latest) ? latest.length : 0
    await loadAppVersionMaps()
    if (count > 0 && selectedDiscoverApp.value?.id === app.name) {
      selectedDiscoverApp.value = buildDiscoverApp(app, toAppVersions(latest, app.name))
    }
    message.success(count > 0 ? `已开启多版本，已同步 ${count} 个版本` : '已开启多版本')
  } catch {
    message.info('已开启多版本')
  }
}
loadMVPrefs()
loadAppVersionMaps()

const showBucketDrawer = ref(false)
const showDiscoverDrawer = ref(false)
const selectedDiscoverApp = ref<DiscoverApp | null>(null)

// ─── 通用软件详情抽屉（已安装 / 软件发现共用） ─────────
const showAppDetailDrawer = ref(false)
const selectedDetailPkg = ref<AppDetailPayload | null>(null)

function openInstalledDetail(pkg: any) {
  selectedDetailPkg.value = {
    name: pkg.name,
    version: pkg.version,
    bucket: pkg.bucket,
    global: pkg.global,
    icon: iconMap.value[pkg.name] ?? null,
  }
  showAppDetailDrawer.value = true
}

function openStoreAppDetail(app: StoreApp) {
  selectedDetailPkg.value = {
    name: app.name,
    description: app.desc,
    homepage: appWebsites[app.name] || undefined,
    icon: iconMap.value[app.name] ?? null,
  }
  showAppDetailDrawer.value = true
}

const detailNewVersion = computed(() => {
  const name = selectedDetailPkg.value?.name
  if (!name) return ''
  return getNewVersion(name)
})

const detailProcessing = computed(() => {
  const name = selectedDetailPkg.value?.name
  if (!name) return false
  return (
    storeInstallingSet.value.has(name)
    || uninstallingSet.value.has(name)
    || pkgProgress.isCurrent(name)
  )
})

function assertScoopCommandSuccess(result: any, fallback: string) {
  if (!result?.success) {
    throw new Error(result?.error || (result?.aborted ? `${fallback}已中止` : `${fallback}失败`))
  }
}

function appendTerminalDiagnostic(messageText: string) {
  window.dispatchEvent(new CustomEvent('scoop-ui:terminal-log', {
    detail: { message: messageText },
  }))
}

function collectRawCommandTail(result: any): string[] {
  const collect = (label: 'stderr' | 'stdout', value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return []
    return value
      .split(/\r?\n|\r/g)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `${label}: ${line}`)
  }

  return [
    ...collect('stderr', result?.stderr),
    ...collect('stdout', result?.stdout),
  ].slice(-48)
}

function appendUpdateStatusDiagnostic(failedByStatus: string[], result: any) {
  const diagnostics = Array.isArray(result?.diagnostics)
    ? result.diagnostics.filter((line: unknown): line is string => typeof line === 'string' && line.trim().length > 0)
    : []
  const rawTail = collectRawCommandTail(result)
  const diagnosticBlock = diagnostics.length > 0
    ? diagnostics.map((line: string) => `  ${line}`).join('\n')
    : rawTail.length > 0
      ? [
          '  原生返回日志尾部：',
          ...rawTail.map(line => `ERROR RAW: ${line}`),
        ].join('\n')
      : '  git-bash/scoop 未返回可展示的 stdout/stderr；Scoop 命令结束后该软件仍显示可更新。'

  appendTerminalDiagnostic([
    `ERROR: Update incomplete: ${failedByStatus.join(', ')} 仍显示可更新。`,
    diagnosticBlock,
  ].join('\n'))
}

async function handleDetailInstall(name: string, options: InstallOptions) {
  if (storeInstallingSet.value.has(name)) return
  const shouldContinue = await ensureSourceReadyBeforeCommand(`安装 ${name}`, 'before-detail-install')
  if (!shouldContinue) return
  openTerminal()
  const s = new Set(storeInstallingSet.value)
  s.add(name)
  storeInstallingSet.value = s
  pkgProgress.startProcessing(name)
  try {
    const result = await window.scoopAPI.install(name, options)
    assertScoopCommandSuccess(result, `${name} 安装`)
    message.success(`${name} 安装完成`)
    packagesStore.loadInstalled()
    showAppDetailDrawer.value = false
  } catch (e: any) {
    message.error(e?.message || `${name} 安装失败`)
  } finally {
    pkgProgress.finishProcessing()
    const next = new Set(storeInstallingSet.value)
    next.delete(name)
    storeInstallingSet.value = next
  }
}

async function handleDetailUninstall(name: string, global: boolean) {
  if (uninstallingSet.value.has(name)) return
  openTerminal()
  const s = new Set(uninstallingSet.value)
  s.add(name)
  uninstallingSet.value = s
  try {
    const result = await window.scoopAPI.uninstall(name, global)
    assertScoopCommandSuccess(result, `${name} 卸载`)
    await packagesStore.loadInstalled()
    await packagesStore.loadUpdatable()
    showAppDetailDrawer.value = false
    message.success(`${name} 已卸载`)
  } catch (e: any) {
    message.error(e?.message || `卸载 ${name} 失败`)
  } finally {
    const s2 = new Set(uninstallingSet.value)
    s2.delete(name)
    uninstallingSet.value = s2
  }
}

function handleDetailUpdate(name: string, global = false) {
  showAppDetailDrawer.value = false
  return handleUpdate({ name, global })
}
const checkingUpdates = ref(false)
const updatingAll = ref(false)
const sourceClockNow = ref(Date.now())
const lastManualCheckAt = ref<number | null>(null)
let sourceClockTimer: number | null = null
let checkButtonResetTimer: number | null = null

// Batch selection state
const selectedPackages = ref<Set<string>>(new Set())
const batchUpdating = ref(false)

// Uninstall state locks
const uninstallingSet = ref<Set<string>>(new Set())
const removingSet = ref<Set<string>>(new Set())

// Pinned packages state
const pinnedPackages = ref<Set<string>>(new Set())

async function loadPinnedFromConfig() {
  try {
    const arr = await window.scoopAPI.getConfig('packages.pinnedPackages')
    if (Array.isArray(arr)) pinnedPackages.value = new Set(arr)
  } catch { /* ignore */ }
}

async function savePinnedToConfig() {
  try {
    await window.scoopAPI.setConfig('packages.pinnedPackages', [...pinnedPackages.value])
  } catch { /* ignore */ }
}

function togglePin(name: string) {
  const s = new Set(pinnedPackages.value)
  if (s.has(name)) {
    s.delete(name)
    const selected = new Set(selectedPackages.value)
    selected.delete(name)
    selectedPackages.value = selected
    saveSelectedToConfig()
  } else {
    s.add(name)
    const selected = new Set(selectedPackages.value)
    selected.add(name)
    selectedPackages.value = selected
    saveSelectedToConfig()
  }
  pinnedPackages.value = s
  savePinnedToConfig()
}

function isPinned(name: string): boolean {
  return pinnedPackages.value.has(name)
}

// Sorted installed packages: pinned first, then alphabetical
const sortedInstalled = computed(() => {
  const list = [...packagesStore.installed]
  return list.sort((a, b) => {
    const aPinned = pinnedPackages.value.has(a.name)
    const bPinned = pinnedPackages.value.has(b.name)
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return a.name.localeCompare(b.name)
  })
})

async function loadSelectedFromConfig() {
  try {
    const arr = await window.scoopAPI.getConfig('packages.selectedPackages')
    if (Array.isArray(arr)) selectedPackages.value = new Set(arr)
  } catch { /* ignore */ }
}

async function saveSelectedToConfig() {
  try {
    await window.scoopAPI.setConfig('packages.selectedPackages', [...selectedPackages.value])
  } catch { /* ignore */ }
}

function toggleSelect(name: string) {
  const s = new Set(selectedPackages.value)
  if (s.has(name)) {
    s.delete(name)
  } else {
    s.add(name)
  }
  selectedPackages.value = s
  saveSelectedToConfig()
}

function toggleSelectAll() {
  const allNames = sortedInstalled.value.map((p: any) => p.name)
  if (selectedPackages.value.size === allNames.length && allNames.every(n => selectedPackages.value.has(n))) {
    selectedPackages.value = new Set()
  } else {
    selectedPackages.value = new Set(allNames)
  }
  saveSelectedToConfig()
}

function isAllSelected(): boolean {
  const allNames = sortedInstalled.value.map((p: any) => p.name)
  return allNames.length > 0 && allNames.every(n => selectedPackages.value.has(n))
}

function isIndeterminate(): boolean {
  const allNames = sortedInstalled.value.map((p: any) => p.name)
  const count = allNames.filter(n => selectedPackages.value.has(n)).length
  return count > 0 && count < allNames.length
}

const selectedPackageNames = computed(() =>
  packagesStore.installed.filter((p: any) => selectedPackages.value.has(p.name)).map((p: any) => p.name)
)

const selectedUpdatableNames = computed(() =>
  packagesStore.updatable.filter((p: any) => selectedPackages.value.has(p.name)).map((p: any) => p.name)
)

const sourceSyncing = computed(() => packagesStore.sourceSyncPhase === 'syncing')

function formatDuration(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms)) return '未知时间'
  if (ms < 60_000) return '刚刚'
  const minutes = Math.max(1, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

const sourceDisplayAgeMs = computed(() => {
  const status = packagesStore.sourceStatus
  if (!status?.lastUpdateMs) return status?.ageMs
  return Math.max(0, sourceClockNow.value - status.lastUpdateMs)
})

const sourceDisplayStale = computed(() => {
  const status = packagesStore.sourceStatus
  const ageMs = sourceDisplayAgeMs.value
  if (!status || ageMs === undefined) return status?.stale ?? false
  return ageMs >= status.intervalMs
})

const sourceStatusLabel = computed(() => {
  if (sourceSyncing.value) return '软件源同步中'
  if (packagesStore.sourceSyncPhase === 'error') return '软件源异常'
  const status = packagesStore.sourceStatus
  if (!status) return '软件源状态未知'
  if (!status.lastUpdate) return '软件源未同步'
  const ageMs = sourceDisplayAgeMs.value
  if (ageMs === undefined) return '软件源时间待识别'
  // < 1 分钟：单独用"刚刚同步 / 刚刚未同步"，避免出现"刚刚前同步"这种奇怪的措辞。
  if (ageMs < 60_000) return sourceDisplayStale.value ? '软件源未同步' : '软件源刚刚同步'
  if (sourceDisplayStale.value) return `软件源 ${formatDuration(ageMs)}未同步`
  return `软件源 ${formatDuration(ageMs)}前同步`
})

const sourceStatusClass = computed(() => {
  if (sourceSyncing.value) return 'dark:text-sky-300 text-sky-700 dark:bg-sky-500/10 bg-sky-50 dark:border-sky-400/20 border-sky-200'
  if (packagesStore.sourceSyncPhase === 'error') return 'dark:text-rose-300 text-rose-700 dark:bg-rose-500/10 bg-rose-50 dark:border-rose-400/20 border-rose-200'
  if (!packagesStore.sourceStatus) return 'dark:text-zinc-300 text-zinc-600 dark:bg-white/[0.04] bg-zinc-50 dark:border-white/[0.08] border-zinc-200'
  if (sourceDisplayStale.value) return 'dark:text-amber-300 text-amber-700 dark:bg-amber-500/10 bg-amber-50 dark:border-amber-400/20 border-amber-200'
  return 'dark:text-emerald-300 text-emerald-700 dark:bg-emerald-500/10 bg-emerald-50 dark:border-emerald-400/20 border-emerald-200'
})

const sourceDotClass = computed(() => {
  if (sourceSyncing.value) return 'bg-sky-400 animate-pulse'
  if (packagesStore.sourceSyncPhase === 'error') return 'bg-rose-400'
  if (!packagesStore.sourceStatus) return 'bg-zinc-400'
  if (sourceDisplayStale.value) return 'bg-amber-400'
  return 'bg-emerald-400'
})

const sourceStatusTitle = computed(() => {
  const status = packagesStore.sourceStatus
  if (packagesStore.sourceSyncError) return packagesStore.sourceSyncError
  if (!status?.lastUpdate) return '尚未读取到 Scoop last_update'
  if (!status.lastUpdateMs) return `Scoop last_update：${status.lastUpdate}；当前版本尚无法解析此时间格式`
  const lastUpdateText = status.lastUpdateMs
    ? new Date(status.lastUpdateMs).toLocaleString('zh-CN')
    : status.lastUpdate
  return status.nextUpdateAt
    ? `上次同步：${lastUpdateText}；下次建议同步：${new Date(status.nextUpdateAt).toLocaleString('zh-CN')}`
    : `上次同步：${lastUpdateText}`
})

const checkUpdateButtonText = computed(() => {
  if (sourceSyncing.value) return '同步中'
  if (checkingUpdates.value) return '检查中'
  if (lastManualCheckAt.value && sourceClockNow.value - lastManualCheckAt.value < 8_000) return '已检查'
  return '检查更新'
})

async function checkUpdatesFast(manual = false) {
  if (checkingUpdates.value) return
  checkingUpdates.value = true
  try {
    await packagesStore.refreshUpdatable({
      sync: manual ? 'force' : 'none',
      reason: manual ? 'manual-check' : 'local-refresh',
    })
    if (manual) {
      lastManualCheckAt.value = Date.now()
      sourceClockNow.value = Date.now()
      if (checkButtonResetTimer !== null) window.clearTimeout(checkButtonResetTimer)
      checkButtonResetTimer = window.setTimeout(() => {
        sourceClockNow.value = Date.now()
        checkButtonResetTimer = null
      }, 8_000)
    }
  } finally {
    checkingUpdates.value = false
  }
}

onMounted(() => {
  loadSelectedFromConfig()
  loadPinnedFromConfig()
  sourceClockNow.value = Date.now()
  sourceClockTimer = window.setInterval(() => {
    sourceClockNow.value = Date.now()
  }, 30_000)
})

onBeforeUnmount(() => {
  if (sourceClockTimer !== null) {
    window.clearInterval(sourceClockTimer)
    sourceClockTimer = null
  }
  if (checkButtonResetTimer !== null) {
    window.clearTimeout(checkButtonResetTimer)
    checkButtonResetTimer = null
  }
})

watch(() => packagesStore.installed.length, () => {
  if (packagesStore.installed.length > 0) {
    nextTick(preloadIcons)
  }
}, { immediate: true })

watch(() => packagesStore.installed, (list) => {
  const names = new Set(list.map((p: any) => p.name))
  let changed = false
  const s = new Set(selectedPackages.value)
  for (const name of s) {
    if (!names.has(name)) {
      s.delete(name)
      changed = true
    }
  }
  if (changed) {
    selectedPackages.value = s
    saveSelectedToConfig()
  }
}, { deep: true })

function showPkgLogs(_name: string) {
  openTerminal()
}

// ═══ 热门推荐（空状态用） ═══
const recommendedPackages = [
  { name: 'git', icon: 'G', desc: '版本控制', color: 'from-orange-500 to-red-500' },
  { name: 'nodejs', icon: 'N', desc: 'JavaScript 运行时', color: 'from-lime-500 to-green-500' },
  { name: '7zip', icon: '7', desc: '压缩工具', color: 'from-yellow-500 to-amber-500' },
  { name: 'neovim', icon: 'N', desc: '终端编辑器', color: 'from-green-600 to-emerald-600' },
]

async function handleInstall(name: string) {
  const shouldContinue = await ensureSourceReadyBeforeCommand(`安装 ${name}`, 'before-recommended-install')
  if (!shouldContinue) return
  openTerminal()
  try {
    await packagesStore.install(name, { global: false, skipCheck: false, independent: false, noUpdateScoop: true })
    message.success(`${name} 安装完成`)
  } catch (e: any) {
    message.error(e?.message || `${name} 安装失败`)
  }
}

// ═══ 商店行内安装 ═══
const storeInstallingSet = ref<Set<string>>(new Set())

const scoopIsProcessing = computed(() =>
  pkgProgress.isProcessing.value
  || batchUpdating.value
  || updatingAll.value
  || checkingUpdates.value
  || storeInstallingSet.value.size > 0
  || uninstallingSet.value.size > 0
  || resettingSet.value.size > 0
)

async function storeQuickInstall(pkgName: string) {
  if (storeInstallingSet.value.has(pkgName)) return
  const shouldContinue = await ensureSourceReadyBeforeCommand(`安装 ${pkgName}`, 'before-store-install')
  if (!shouldContinue) return
  openTerminal()
  const s = new Set(storeInstallingSet.value)
  s.add(pkgName)
  storeInstallingSet.value = s
  pkgProgress.startProcessing(pkgName)
  try {
    const result = await window.scoopAPI.install(pkgName, { global: false, skipCheck: false, independent: false, noUpdateScoop: true })
    assertScoopCommandSuccess(result, `${pkgName} 安装`)
    message.success(`${pkgName} 安装完成`)
    packagesStore.loadInstalled()
  } catch (e: any) {
    message.error(e?.message || `${pkgName} 安装失败`)
  } finally {
    pkgProgress.finishProcessing()
    const next = new Set(storeInstallingSet.value)
    next.delete(pkgName)
    storeInstallingSet.value = next
  }
}

// ═══ 多版本发现抽屉 ═══
function buildFallbackDiscoverApp(app: StoreApp): DiscoverApp {
  const baseName = app.name
  return {
    id: app.name,
    name: app.name,
    description: app.desc,
    icon: app.icon,
    gradient: app.gradient,
    website: appWebsites[app.name] || '',
    versions: [{
      version: 'latest',
      bucket: 'main',
      manifestName: baseName,
      isInstalled: installedNames.value.has(baseName),
    }],
  }
}

// 将配置缓存里的 { name, version, bucket } 转为抽屉所需 AppVersion（补 manifestName + 实时 isInstalled）
// 并按"主包优先 → 版本号降序"排序，与后端解析后展示顺序保持一致。
function toAppVersions(entries: AppVersionEntry[], baseName: string): AppVersion[] {
  const base = baseName.toLowerCase()
  return entries
    .map(e => ({
      version: e.version,
      bucket: e.bucket,
      manifestName: e.name,
      isInstalled: installedNames.value.has(e.name),
    }))
    .sort((a, b) => {
      if (a.manifestName.toLowerCase() === base) return -1
      if (b.manifestName.toLowerCase() === base) return 1
      return b.version.localeCompare(a.version, undefined, { numeric: true })
    })
}

function buildDiscoverApp(app: StoreApp, versions: AppVersion[]): DiscoverApp {
  return {
    id: app.name,
    name: app.name,
    description: app.desc,
    icon: app.icon,
    gradient: app.gradient,
    website: appWebsites[app.name] || '',
    versions,
  }
}

/**
 * 打开多版本发现抽屉 —— 三步走受控交互：
 *   1. 优先读本地 config.appVersionMaps 缓存，命中即刻渲染，实现秒开、零延迟；
 *   2. 无论有无缓存，后台静默唤醒 scoop:syncAppVersions（scoop search → 解析 → 回写）；
 *   3. IPC 返回最新全量版本后，无缝更新响应式变量刷新 UI。
 */
async function openDiscoverDrawer(app: StoreApp) {
  showDiscoverDrawer.value = true

  // ── 第一步：秒开——先读缓存 ──
  let hasCache = false
  try {
    const cached = await window.scoopAPI.getAppVersions(app.name)
    if (Array.isArray(cached) && cached.length > 0) {
      selectedDiscoverApp.value = buildDiscoverApp(app, toAppVersions(cached, app.name))
      hasCache = true
    }
  } catch { /* 读缓存失败，走无缓存分支 */ }

  if (!hasCache) {
    // 无缓存：展示骨架占位，用整屏 loading 态
    selectedDiscoverApp.value = buildDiscoverApp(app, [])
    discoverLoading.value = true
  } else {
    // 有缓存：整屏不 loading，仅右上角微型转圈提示后台刷新
    discoverLoading.value = false
    discoverRefreshing.value = true
  }

  // ── 第二步：后台静默同步最新版本 ──
  try {
    const latest = await window.scoopAPI.syncAppVersions(app.name)
    // 用户可能已切到别的软件，回填前校验当前抽屉仍是此 app，避免串数据
    if (selectedDiscoverApp.value?.id !== app.name) return
    // ── 第三步：无缝刷新 ──
    if (Array.isArray(latest) && latest.length > 0) {
      selectedDiscoverApp.value = buildDiscoverApp(app, toAppVersions(latest, app.name))
      await loadAppVersionMaps()
    } else if (!hasCache) {
      // 既无缓存又同步无果（如网络异常）→ 兜底单版本，避免空抽屉
      selectedDiscoverApp.value = buildFallbackDiscoverApp(app)
    }
  } catch {
    if (!hasCache && selectedDiscoverApp.value?.id === app.name) {
      selectedDiscoverApp.value = buildFallbackDiscoverApp(app)
    }
  } finally {
    discoverLoading.value = false
    discoverRefreshing.value = false
  }
}

/**
 * 分类卡片点击：
 *   - 多版本模式开启 → 打开多版本抽屉；
 *   - 其余情况（未安装 / 已安装） → 打开统一的通用详情抽屉。
 * 快速安装、多版本入口仍由右侧独立按钮触发，互不干扰。
 */
function handleCardClick(app: StoreApp) {
  if (getMVEnabled(app)) {
    openDiscoverDrawer(app)
  } else {
    openStoreAppDetail(app)
  }
}

async function handleDiscoverInstall(manifestName: string) {
  if (storeInstallingSet.value.has(manifestName)) return
  const shouldContinue = await ensureSourceReadyBeforeCommand(`安装 ${manifestName}`, 'before-discover-install')
  if (!shouldContinue) return
  openTerminal()
  const s = new Set(storeInstallingSet.value)
  s.add(manifestName)
  storeInstallingSet.value = s
  pkgProgress.startProcessing(manifestName)
  try {
    const result = await window.scoopAPI.install(manifestName, { global: false, skipCheck: false, independent: false, noUpdateScoop: true })
    assertScoopCommandSuccess(result, `${manifestName} 安装`)
    message.success(`${manifestName} 安装完成`)
    packagesStore.loadInstalled()
    // 刷新 drawer 内的已安装状态
    if (selectedDiscoverApp.value) {
      selectedDiscoverApp.value = { ...selectedDiscoverApp.value }
    }
  } catch (e: any) {
    message.error(e?.message || `${manifestName} 安装失败`)
  } finally {
    pkgProgress.finishProcessing()
    const next = new Set(storeInstallingSet.value)
    next.delete(manifestName)
    storeInstallingSet.value = next
  }
}

async function handleResetActive(appName: string, familyKey?: string) {
  if (resettingSet.value.has(appName)) return

  const resolvedFamilyKey = familyKey || getMultiVersionFamily(appName)
  if (!resolvedFamilyKey) {
    message.warning(`${appName} 未在多版本配置中关联`)
    return
  }

  const next = new Set(resettingSet.value)
  next.add(appName)
  resettingSet.value = next

  try {
    const result = await window.scoopAPI.reset(appName)
    if (!result.success) {
      throw new Error(result.error || result.stderr || result.stdout || `scoop reset ${appName} 失败`)
    }

    activeVersionByFamily.value = {
      ...activeVersionByFamily.value,
      [resolvedFamilyKey]: appName,
    }

    await Promise.all([
      packagesStore.loadInstalled(),
      packagesStore.loadUpdatable(),
    ])

    if (selectedDiscoverApp.value) {
      selectedDiscoverApp.value = { ...selectedDiscoverApp.value }
    }
    message.success(`已切换活动版本为 ${appName}`)
  } catch (e: any) {
    message.error(e?.message || `切换 ${appName} 活动版本失败`)
  } finally {
    const done = new Set(resettingSet.value)
    done.delete(appName)
    resettingSet.value = done
  }
}

async function refreshAfterNativeUpdate(names: string[]) {
  await Promise.all([
    packagesStore.loadInstalled(),
    packagesStore.loadUpdatable(),
  ])

  // 仅按 scoop status/list 真实结果判定哪些仍可更新（用于文案提示），
  // 不再逐包写入 success/error 行内态——行高亮由全局 currentProcessingPackageName 驱动。
  const stillUpdatable = new Set(packagesStore.updatable.map((p: any) => p.name))
  for (const name of names) {
    window.scoopAPI.clearAppIcon(name).catch(() => {})
    fetchIcon(name)
  }

  return names.filter((name) => stillUpdatable.has(name))
}

async function ensureSourceReadyForUpdate() {
  return ensureSourceReadyBeforeCommand('执行更新', 'before-native-update')
}

/**
 * 原生批量更新：不再由前端循环调度，直接一次 IPC → 一次 spawn → `scoop update a b c`。
 * 完成后只按 `scoop status/list` 的真实结果做终态对齐，不从日志里猜成功失败。
 */
async function runNativeUpdate(names: string[], flag: { value: boolean }) {
  const uniqueNames = [...new Set(names)].filter(Boolean)
  if (uniqueNames.length === 0 || flag.value) return

  flag.value = true
  let processingStarted = false

  try {
    const shouldContinue = await ensureSourceReadyForUpdate()
    if (!shouldContinue) return

    openTerminal()
    nativeUpdateCount.value = uniqueNames.length
    // 亮起全局呼吸条；先把首个软件设为激活行，随后由日志流嗅探自动随动切换
    pkgProgress.startProcessing(uniqueNames[0])
    processingStarted = true

    const result = await window.scoopAPI.update(uniqueNames)
    const failedByStatus = await refreshAfterNativeUpdate(uniqueNames)

    if (failedByStatus.length > 0) {
      appendUpdateStatusDiagnostic(failedByStatus, result)
      const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : []
      const rawTail = collectRawCommandTail(result)
      message.error(result.error || diagnostics[0] || rawTail[rawTail.length - 1] || `${failedByStatus.length} 个软件仍显示可更新，请查看终端日志`)
      return
    }
    if (!result.success) {
      message.warning(result.error || '命令退出码异常，但本地状态已完成对齐')
      return
    }
    message.success(uniqueNames.length === 1 ? `${uniqueNames[0]} 更新完成` : `已完成 ${uniqueNames.length} 个软件更新`)
  } catch (e) {
    await Promise.allSettled([
      packagesStore.loadInstalled(),
      packagesStore.loadUpdatable(),
    ])
    message.error((e as Error)?.message || '更新失败')
  } finally {
    // 全流程收尾：熄灭呼吸条 + 清除所有行高亮
    if (processingStarted) pkgProgress.finishProcessing()
    flag.value = false
    nativeUpdateCount.value = 0
  }
}

async function handleUpdate(pkg: any) {
  if (pkgProgress.isProcessing.value) return
  const name = typeof pkg === 'string' ? pkg : pkg?.name
  if (!name) return
  const global = typeof pkg === 'object' ? !!pkg?.global : false
  const shouldContinue = await ensureSourceReadyBeforeCommand(`强制更新 ${name}`, 'before-force-update')
  if (!shouldContinue) return

  openTerminal()
  pkgProgress.startProcessing(name)
  try {
    const result = await window.scoopAPI.update(name, { force: true, global })
    assertScoopCommandSuccess(result, `${name} 强制更新`)
    await Promise.all([
      packagesStore.loadInstalled(),
      packagesStore.loadUpdatable(),
    ])
    window.scoopAPI.clearAppIcon(name).catch(() => {})
    fetchIcon(name)
    message.success(`${name} 强制更新完成`)
  } catch (e: any) {
    message.error(e?.message || `强制更新 ${name} 失败`)
  } finally {
    pkgProgress.finishProcessing()
  }
}

function handleBatchUpdate() {
  const names = selectedUpdatableNames.value
  if (names.length === 0) {
    message.warning('请先勾选带有更新标志的软件')
    return
  }
  runNativeUpdate(names, batchUpdating)
}

function handleUpdateAllConfirm() {
  const count = packagesStore.updatable.length
  if (count === 0) return
  dialog.warning({
    title: '确认更新全部',
    content: `是否确定更新全部 ${count} 个软件？Scoop 将以原生命令一次性批量执行。`,
    positiveText: '立即更新',
    negativeText: '取消',
    onPositiveClick: () => {
      const names = packagesStore.updatable.map((p) => p.name)
      runNativeUpdate(names, updatingAll)
    },
  })
}

async function handleUninstall(pkg: any) {
  if (uninstallingSet.value.has(pkg.name)) return
  openTerminal()
  const s = new Set(uninstallingSet.value)
  s.add(pkg.name)
  uninstallingSet.value = s
  try {
    const result = await window.scoopAPI.uninstall(pkg.name, pkg.global)
    assertScoopCommandSuccess(result, `${pkg.name} 卸载`)
    const r = new Set(removingSet.value)
    r.add(pkg.name)
    removingSet.value = r
    await new Promise(resolve => setTimeout(resolve, 400))
    await packagesStore.loadInstalled()
    await packagesStore.loadUpdatable()
  } catch (e: any) {
    message.error(e.message || `卸载 ${pkg.name} 失败`)
  } finally {
    const s2 = new Set(uninstallingSet.value)
    s2.delete(pkg.name)
    uninstallingSet.value = s2
    const r2 = new Set(removingSet.value)
    r2.delete(pkg.name)
    removingSet.value = r2
  }
}

function handleBatchUninstall() {
  const names = selectedPackageNames.value
  if (names.length === 0) return
  batchUninstallDialogReforge.value = dialog.warning({
    title: '确认批量卸载',
    content: `确定要彻底卸载已选中的 ${names.length} 款软件吗？此操作不可逆。`,
    positiveText: '确认卸载',
    negativeText: '取消',
    onPositiveClick: () => {
      // 立即关闭弹窗，不等待异步操作
      batchUninstallDialogReforge.value?.destroy()
      batchUninstallDialogReforge.value = null
      // 执行卸载（不返回 Promise，让弹窗立即关闭）
      executeBatchUninstall(names)
      return true // 返回 true 确保关闭
    },
  })
}

async function executeBatchUninstall(names: string[]) {
  openTerminal()
  // 锁定所有选中卡片
  const lockSet = new Set(uninstallingSet.value)
  for (const n of names) lockSet.add(n)
  uninstallingSet.value = lockSet

  let failed = 0
  for (const name of names) {
    try {
      const pkg = packagesStore.installed.find((p: any) => p.name === name)
      const result = await window.scoopAPI.uninstall(name, pkg?.global || false)
      assertScoopCommandSuccess(result, `${name} 卸载`)
      // 退出动画：逐个标记移除
      const r = new Set(removingSet.value)
      r.add(name)
      removingSet.value = r
      await new Promise(resolve => setTimeout(resolve, 350))
    } catch {
      failed++
    }
  }

  // 精简通知：仅在有失败时提示，成功则静默
  if (failed > 0) {
    message.warning(`${names.length - failed} 个卸载成功，${failed} 个卸载失败`)
  }

  // 从选中状态中移除已卸载的软件，保留其他选中状态
  const newSelected = new Set(selectedPackages.value)
  for (const name of names) {
    newSelected.delete(name)
  }
  selectedPackages.value = newSelected
  saveSelectedToConfig()
  await packagesStore.loadInstalled()
  await packagesStore.loadUpdatable()

  // 解锁
  uninstallingSet.value = new Set()
  removingSet.value = new Set()
}

function openBucketDrawer() {
  showBucketDrawer.value = true
}
</script>

<template>
  <div class="flex gap-5 h-full">
    <!-- === 左侧大卡片：弹性自适应，最小 450px === -->
    <div class="flex-1 min-w-[450px] h-full">
      <NCard
        :bordered="false"
        class="overflow-hidden glass-card h-full"
        content-class="!p-0 flex flex-col h-full"
      >
        <NTabs
          type="line"
          size="large"
          :default-value="'installed'"
          class="flex-1 flex flex-col overflow-hidden dashboard-tabs"
          :pane-style="{ padding: '0', height: '100%' }"
        >
          <template #prefix>
            <span class="font-semibold text-[14px] dark:text-zinc-50 text-zinc-900 ml-5">应用管理</span>
          </template>
          <template #suffix>
            <div class="flex items-center gap-1 mr-3">
              <button
                @click="openBucketDrawer"
                class="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 dark:text-zinc-400 text-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200 dark:bg-white/[0.04] bg-zinc-100 hover:bg-zinc-200 dark:hover:bg-white/[0.08]"
              >
                <NIcon :component="Cube" size="14" />
                <span>软件源</span>
              </button>
              <span
                class="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium select-none whitespace-nowrap min-w-[132px]"
                :class="sourceStatusClass"
                :title="sourceStatusTitle"
              >
                <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="sourceDotClass" />
                <span class="tabular-nums">{{ sourceStatusLabel }}</span>
              </span>
            </div>
          </template>

          <NTabPane name="installed" class="flex-1 overflow-hidden">
            <template #tab>
              <span class="text-[14px]">已安装</span>
            </template>

            <!-- 初始加载状态 -->
            <div v-if="packagesStore.loading && packagesStore.installed.length === 0" class="flex justify-center py-8">
              <div class="flex flex-col items-center gap-2">
                <div class="w-5 h-5 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
                <span class="text-[11px] font-normal dark:text-zinc-500 text-zinc-400">加载中...</span>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-else-if="packagesStore.installed.length === 0" class="flex flex-col h-full overflow-y-auto">
              <div class="flex flex-col items-center justify-center pt-10 pb-5 px-8 flex-shrink-0">
                <NEmpty description="暂无已安装的软件包">
                  <template #icon>
                    <NIcon :component="CubeOutline" size="48" class="dark:text-zinc-600 text-zinc-300" />
                  </template>
                  <template #extra>
                    <p class="text-[11px] font-normal dark:text-zinc-500 text-zinc-400 mt-1">使用顶部搜索框查找并安装软件</p>
                  </template>
                </NEmpty>
              </div>
              <div class="flex-1 flex flex-col justify-end mt-4 mx-5 mb-4">
                <div class="bg-zinc-50 dark:bg-gray-800/40 rounded-lg p-4 border border-zinc-200 dark:border-gray-700/30">
                  <div class="flex items-center gap-2 mb-4">
                    <span class="text-[11px] font-semibold dark:text-zinc-500 text-zinc-500 uppercase tracking-wider">热门推荐</span>
                    <div class="flex-1 h-px bg-zinc-200 dark:bg-gray-700/40" />
                  </div>
                  <div class="grid grid-cols-4 gap-3">
                    <div v-for="pkg in recommendedPackages" :key="pkg.name"
                      class="flex flex-col items-center gap-2 p-3 rounded-lg bg-white dark:bg-gray-800/60 hover:bg-zinc-50 dark:hover:bg-gray-700/50 border border-zinc-200 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200 group"
                    >
                      <div class="w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform" :class="pkg.color">
                        <span class="text-white text-sm font-bold">{{ pkg.icon }}</span>
                      </div>
                      <span class="text-[12px] font-semibold dark:text-zinc-50 text-zinc-900">{{ pkg.name }}</span>
                      <span class="text-[10px] font-normal dark:text-zinc-500 text-zinc-500 -mt-1">{{ pkg.desc }}</span>
                      <NButton size="tiny" secondary :disabled="installedNames.has(pkg.name)"
                        :loading="packagesStore.loading && packagesStore.progress?.package === pkg.name"
                        @click.stop="handleInstall(pkg.name)" class="!mt-1 btn-hover-scale w-full !rounded-md"
                      >{{ installedNames.has(pkg.name) ? '已安装' : '安装' }}</NButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 已安装列表（常驻显示，永不消失） -->
            <NScrollbar v-else class="h-full custom-scrollbar">
              <!-- 批量操作工具栏（Raycast 风格，与列表行全等对齐） -->
              <div
                class="sticky top-0 z-20 py-2 backdrop-blur-md border-b dark:border-white/[0.03] border-zinc-200"
                style="background: var(--app-bg); opacity: 0.95;"
              >
                <div class="flex items-center gap-3 px-4 h-14">
                  <!-- 左侧：全选 + 计数 -->
                  <div class="flex-shrink-0 w-6">
                    <NCheckbox
                      :checked="isAllSelected()"
                      :indeterminate="isIndeterminate()"
                      @update:checked="toggleSelectAll"
                    />
                  </div>
                  <span class="text-[12px] font-normal dark:text-zinc-500 text-gray-500 select-none">
                    已选 <strong class="dark:text-zinc-300 text-gray-300 font-medium">{{ selectedPackageNames.length }}</strong> 项
                  </span>

                  <!-- 右侧：操作按钮 -->
                  <div class="flex items-center gap-2 ml-auto">
                    <template v-if="checkingUpdates">
                      <div class="w-3.5 h-3.5 border-[1.5px] border-t-transparent border-gray-500 rounded-full animate-spin" />
                      <span class="text-[12px] font-normal dark:text-zinc-500 text-gray-500">
                        {{ packagesStore.updateCheckText || '检查中...' }}
                      </span>
                    </template>
                    <template v-else>
                      <span
                        v-if="packagesStore.updateCheckWarnings.length > 0"
                        class="text-[11px] font-normal dark:text-amber-300/80 text-amber-700"
                      >
                        {{ packagesStore.updateCheckWarnings.length }} 个源使用缓存
                      </span>
                      <span
                        v-if="packagesStore.manifestChanged.length > 0"
                        class="text-[11px] font-normal dark:text-sky-300/80 text-sky-700"
                      >
                        {{ packagesStore.manifestChanged.length }} 个清单变更待确认
                      </span>
                      <button
                        :disabled="batchUpdating || updatingAll || checkingUpdates || sourceSyncing"
                        @click="checkUpdatesFast(true)"
                        class="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md transition-all select-none"
                        :class="batchUpdating || updatingAll || checkingUpdates || sourceSyncing
                          ? 'bg-transparent dark:text-zinc-500 text-gray-500 cursor-not-allowed'
                          : 'bg-transparent dark:text-zinc-400 text-gray-500 hover:bg-black/[0.06] dark:hover:bg-white/[0.10] cursor-pointer'"
                      >
                        <NIcon :component="RefreshOutline" :size="15" :class="checkingUpdates || sourceSyncing ? 'animate-spin' : ''" />
                        {{ checkUpdateButtonText }}
                      </button>
                      <button
                        :disabled="selectedUpdatableNames.length === 0 || batchUpdating || updatingAll"
                        @click="handleBatchUpdate"
                        class="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md border transition-all select-none"
                        :class="selectedUpdatableNames.length === 0 || batchUpdating || updatingAll
                          ? 'dark:border-white/[0.04] border-black/[0.06] bg-transparent dark:text-zinc-500 text-gray-500 cursor-not-allowed'
                          : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 cursor-pointer'"
                      >
                        <template v-if="batchUpdating">
                          <div class="w-3.5 h-3.5 border-[1.5px] border-t-transparent border-indigo-400 rounded-full animate-spin" />
                          Scoop 执行中 ({{ nativeUpdateCount }})
                        </template>
                        <template v-else>
                          <NIcon :component="DownloadOutline" :size="15" />
                          更新已选 ({{ selectedUpdatableNames.length }})
                        </template>
                      </button>
                      <button
                        :disabled="selectedPackageNames.length === 0"
                        @click="handleBatchUninstall"
                        class="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md border transition-all select-none"
                        :class="selectedPackageNames.length === 0
                          ? 'dark:border-white/[0.04] border-black/[0.06] bg-transparent dark:text-zinc-500 text-gray-500 cursor-not-allowed'
                          : 'border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer'"
                      >
                        <NIcon :component="TrashOutline" :size="15" />
                        卸载已选 ({{ selectedPackageNames.length }})
                      </button>
                      <button
                        :disabled="packagesStore.updatable.length === 0 || updatingAll || batchUpdating"
                        @click="handleUpdateAllConfirm"
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium rounded-md transition-all select-none"
                        :class="packagesStore.updatable.length === 0 || batchUpdating
                          ? 'bg-transparent dark:text-zinc-500 text-gray-500 cursor-not-allowed'
                          : 'bg-transparent dark:text-zinc-400 text-gray-400 hover:bg-black/[0.06] dark:hover:bg-white/[0.10] cursor-pointer'"
                      >
                        <template v-if="updatingAll">
                          <div class="w-3.5 h-3.5 border-[1.5px] border-t-transparent border-current rounded-full animate-spin" />
                          Scoop 执行中 ({{ nativeUpdateCount }})
                        </template>
                        <template v-else>
                          更新全部
                          <template v-if="packagesStore.updatable.length > 0">
                            ({{ packagesStore.updatable.length }})
                          </template>
                        </template>
                      </button>
                    </template>
                  </div>
                </div>
              </div>

              <!-- 顶部 2px 流动呼吸条：Scoop 执行时显现；闲置时仅保留极弱分割线 -->
              <div class="shimmer-slot">
                <Transition name="shimmer-fade">
                  <div v-show="scoopIsProcessing" class="shimmer-bar" />
                </Transition>
              </div>

              <!-- 已安装列表（纯净单色流风格） -->
              <div class="flex flex-col pt-2 pb-4">
                <TransitionGroup name="list" tag="div" class="flex flex-col">
                  <AppListItem
                    v-for="pkg in sortedInstalled"
                    :key="pkg.name"
                    :pkg="pkg"
                    :mode="updatableNames.has(pkg.name) ? 'updatable' : 'installed'"
                    :checked="selectedPackages.has(pkg.name)"
                    :disabled="uninstallingSet.has(pkg.name)"
                    :pinned="isPinned(pkg.name)"
                    :new-version="getNewVersion(pkg.name)"
                    :changed-version="manifestChangedNames.has(pkg.name) ? getChangedVersion(pkg.name) : ''"
                    :active="pkgProgress.isCurrent(pkg.name)"
                    :resettable="isMultiVersionApp(pkg.name)"
                    :resetting="resettingSet.has(pkg.name)"
                    :active-version="isActiveMultiVersionApp(pkg.name)"
                    :multi-version-family="getMultiVersionFamily(pkg.name)"
                    :icon="getIcon(pkg.name)"
                    @toggle-check="toggleSelect"
                    @update="handleUpdate"
                    @uninstall="handleUninstall"
                    @reset="handleResetActive"
                    @show-logs="showPkgLogs"
                    @toggle-pin="togglePin"
                    @select="openInstalledDetail"
                  />
                </TransitionGroup>
              </div>
            </NScrollbar>
          </NTabPane>

          <NTabPane name="discover" class="flex-1 overflow-hidden">
            <template #tab>
              <span class="text-[14px]">软件发现</span>
            </template>
            <div class="flex h-full overflow-hidden">
              <!-- ═══ 左侧分类导航 ═══ -->
              <div class="w-[140px] flex-shrink-0 border-r dark:border-white/[0.04] border-zinc-200 py-2 overflow-y-auto custom-scrollbar">
                <div
                  v-for="cat in categories"
                  :key="cat.id"
                  class="flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors duration-150 text-[12px]"
                  :class="activeCategoryId === cat.id
                    ? 'font-semibold dark:bg-white/[0.06] dark:text-zinc-50 bg-zinc-100 text-zinc-900'
                    : 'font-medium dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-white/[0.02] text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'"
                  @click="activeCategoryId = cat.id"
                >
                  <NIcon :component="cat.icon" :size="14" class="flex-shrink-0" />
                  <span class="truncate">{{ cat.name }}</span>
                </div>
              </div>

              <!-- ═══ 右侧内容大厅 ═══ -->
              <div class="flex-1 min-w-0 overflow-y-auto custom-scrollbar px-4 py-3">
                <!-- 分类标题 -->
                <div class="flex items-center gap-2 mb-3">
                  <NIcon :component="activeCategory.icon" :size="15" class="dark:text-zinc-400 text-zinc-500" />
                  <span class="text-[13px] font-semibold dark:text-zinc-50 text-zinc-900">{{ activeCategory.name }}</span>
                  <span class="px-1.5 py-0.5 text-[10px] font-normal dark:bg-white/[0.04] bg-zinc-100 dark:text-zinc-500 text-zinc-600 rounded font-mono">{{ activeCategory.apps.length }}</span>
                </div>

                <!-- 应用卡片网格 -->
                <div class="grid grid-cols-2 gap-2.5">
                  <div
                    v-for="app in activeCategory.apps"
                    :key="app.name"
                    class="group relative flex items-center gap-3 p-3 rounded-lg dark:border-white/[0.04] dark:bg-white/[0.01] dark:hover:bg-white/[0.03] dark:hover:border-white/[0.08] border-zinc-200 bg-zinc-50 hover:bg-zinc-100 hover:border-zinc-300 transition-all duration-200"
                    :class="getMVEnabled(app) ? 'cursor-pointer' : installedNames.has(app.name) ? '' : 'cursor-pointer'"
                    @click="handleCardClick(app)"
                  >
                    <!-- 图标 -->
                    <div
                      class="w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-sm"
                      :class="app.gradient"
                    >
                      <span class="text-white text-sm font-bold">{{ app.icon }}</span>
                    </div>
                    <!-- 信息 -->
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-mono text-[13px] font-semibold dark:text-zinc-50 text-zinc-900 truncate">{{ app.name }}</span>
                        <span v-if="installedNames.has(app.name)" class="text-[10px] font-normal dark:text-zinc-500 text-zinc-500 font-mono flex-shrink-0">已安装</span>
                        <span v-else-if="getMVEnabled(app)" class="text-[10px] font-normal text-violet-500/60 font-mono flex-shrink-0">多版</span>
                      </div>
                      <p class="text-[11px] font-medium dark:text-zinc-300 text-zinc-600 truncate mt-0.5">{{ app.desc }}</p>
                    </div>
                    <!-- 右侧操作区 -->
                    <div class="flex-shrink-0 flex items-center self-center gap-1">
                      <!-- MV 开启：多版本入口 -->
                      <template v-if="getMVEnabled(app)">
                        <NButton
                          text size="tiny"
                          class="!text-violet-400/70 hover:!text-violet-300 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          @click.stop="openDiscoverDrawer(app)"
                        >
                          <template #icon><NIcon :component="CubeOutline" size="13" /></template>
                        </NButton>
                      </template>
                      <!-- MV 关闭 + 未安装：快速安装 -->
                      <template v-else-if="!installedNames.has(app.name)">
                        <NButton
                          text size="tiny"
                          class="!text-gray-500 dark:hover:!text-white hover:!text-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          @click.stop="storeQuickInstall(app.name)"
                        >
                          <template #icon><NIcon :component="DownloadOutline" size="14" /></template>
                        </NButton>
                      </template>
                      <!-- MV 切换开关 -->
                      <button
                        class="w-5 h-5 flex items-center justify-center rounded transition-all duration-150"
                        :class="getMVEnabled(app)
                          ? 'text-violet-400/70 hover:text-violet-300 bg-violet-500/10'
                          : 'dark:text-gray-600 dark:hover:text-gray-400 dark:hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'"
                        :title="getMVEnabled(app) ? '关闭多版本模式' : '开启多版本模式'"
                        @click.stop="toggleMV(app)"
                      >
                        <NIcon :component="FlashOutline" :size="11" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </NTabPane>
        </NTabs>
      </NCard>
    </div>

    <!-- === 右侧列：宽屏自适应撑宽，紧凑时保底 420px，宽屏最多撑到 560px === -->
    <div class="flex-1 w-full min-w-[420px] max-w-[560px] flex flex-col gap-5 h-full">
      <StorageEnvCard />
    </div>

    <BucketDrawer v-model:show="showBucketDrawer" />

    <AppDiscoverDrawer
      v-model:show="showDiscoverDrawer"
      :app="selectedDiscoverApp"
      :installed-names="installedNames"
      :installing-set="storeInstallingSet"
      :resetting-set="resettingSet"
      :active-version-name="getActiveVersionForFamily(selectedDiscoverApp?.id)"
      :loading="discoverLoading"
      :refreshing="discoverRefreshing"
      @install="handleDiscoverInstall"
      @reset="handleResetActive"
    />

    <!-- 全局复用的软件详情抽屉：已安装 / 软件发现共用 -->
    <AppDetailDrawer
      v-model:show="showAppDetailDrawer"
      :pkg="selectedDetailPkg"
      :is-installed="!!selectedDetailPkg && installedNames.has(selectedDetailPkg.name)"
      :updatable="!!selectedDetailPkg && updatableNames.has(selectedDetailPkg.name)"
      :new-version="detailNewVersion"
      :processing="detailProcessing"
      @install="handleDetailInstall"
      @uninstall="handleDetailUninstall"
      @update="handleDetailUpdate"
    />

  </div>
</template>

<style scoped>
/* ═══ 顶部 2px 流动呼吸条：闲置静默，执行时纯流光循环位移 ═══ */
.shimmer-slot {
  position: relative;
  height: 1px;
  overflow: hidden;
  flex-shrink: 0;
  background-color: rgb(39 39 42 / 0.18);
}
.dark .shimmer-slot {
  background-color: rgb(255 255 255 / 0.04);
}
.shimmer-bar {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgb(16 185 129 / 0.15) 20%,
    rgb(16 185 129 / 0.9) 50%,
    rgb(16 185 129 / 0.15) 80%,
    transparent 100%
  );
  background-size: 50% 100%;
  background-repeat: no-repeat;
  animation: shimmer-slide 1.4s linear infinite;
}
@keyframes shimmer-slide {
  0% {
    background-position: -60% 0;
  }
  100% {
    background-position: 160% 0;
  }
}
/* 呼吸条显隐淡入淡出 */
.shimmer-fade-enter-active,
.shimmer-fade-leave-active {
  transition: opacity 0.3s ease;
}
.shimmer-fade-enter-from,
.shimmer-fade-leave-to {
  opacity: 0;
}

/* 零延迟原地蒸发 + 列表精准补位 */
.list-leave-active {
  position: absolute;
  width: 100%;
  opacity: 0;
  transition: none !important; /* 彻底杀死淡出延迟，瞬间蒸发 */
}

.list-leave-to {
  opacity: 0;
}

/* 下方卡片补位：干脆利落的微秒级上推 */
.list-move {
  transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* 进入动画（备用） */
.list-enter-active {
  transition: all 0.15s ease-out;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

/* ═══ 顶部 Tab 栏字重/色彩三层秩序接管 ═══ */
/* 未选中：二级视觉 —— font-medium(500) + 暗淡色，主动让出焦点 */
.dashboard-tabs :deep(.n-tabs-tab .n-tabs-tab__label) {
  font-weight: 500;
  transition: color 0.2s ease, font-weight 0.2s ease;
}
.dashboard-tabs :deep(.n-tabs-tab:not(.n-tabs-tab--active) .n-tabs-tab__label) {
  color: #9ca3af; /* 亮色未选中：text-gray-400 */
}
:where(.dark) .dashboard-tabs :deep(.n-tabs-tab:not(.n-tabs-tab--active) .n-tabs-tab__label) {
  color: #a1a1aa; /* 暗色未选中：text-zinc-400 */
}
/* 选中：一级视觉 —— font-semibold(600) + 最亮纯白/深色 */
.dashboard-tabs :deep(.n-tabs-tab--active .n-tabs-tab__label) {
  font-weight: 600;
  color: var(--app-primary, #1f2937); /* 亮色选中：跟随主题色，回退 text-gray-800 */
}
:where(.dark) .dashboard-tabs :deep(.n-tabs-tab--active .n-tabs-tab__label) {
  color: #fafafa; /* 暗色选中：text-zinc-50 */
}
</style>
