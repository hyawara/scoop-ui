<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, type Ref } from 'vue'
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
} from '@vicons/ionicons5'
import { usePackagesStore } from '@/stores/packages'
import { useSettingsStore } from '@/stores/settings'
import StorageEnvCard from '@/components/StorageEnvCard.vue'
import ProxyCard from '@/components/ProxyCard.vue'

import AppListItem from '@/components/AppListItem.vue'
import BucketDrawer from '@/components/BucketDrawer.vue'
import AppDiscoverDrawer from '@/components/AppDiscoverDrawer.vue'
import { usePackageProgress } from '@/composables/usePackageProgress'
import type { DiscoverApp, AppVersion } from '@/types'

const packagesStore = usePackagesStore()
const settingsStore = useSettingsStore()
const message = useMessage()
const dialog = useDialog()

// 批量卸载弹窗引用，用于手动关闭
const batchUninstallDialogReforge = ref<ReturnType<typeof dialog.warning> | null>(null)

// 行内进度系统
const pkgProgress = usePackageProgress()
const updatingPackages = ref<Set<string>>(new Set())

// 单包日志弹窗
const showPkgLogModal = ref(false)
const activePkgLogName = ref('')
const pkgLogContainerRef = ref<HTMLDivElement | null>(null)

// 图标缓存
const iconMap = ref<Record<string, string | null>>({})
const iconFetching = ref<Set<string>>(new Set())

const installedNames = computed(() =>
  new Set(packagesStore.installed.map((p: any) => p.name))
)

const updatableNames = computed(() =>
  new Set(packagesStore.updatable.map((p: any) => p.name))
)

function getNewVersion(name: string): string {
  const pkg = packagesStore.updatable.find((p: any) => p.name === name)
  return pkg?.newVersion || ''
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
      { name: 'scoop', icon: 'S', desc: '命令行包管理器', gradient: 'from-red-500 to-orange-500' },
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
  if (set.has(app.name)) set.delete(app.name)
  else set.add(app.name)
  multiVersionPref.value = [...set]
  await window.scoopAPI.setConfig('discover.multiVersionPrefs', [...set])
  if (set.has(app.name)) openDiscoverDrawer(app)
}
loadMVPrefs()

const showBucketDrawer = ref(false)
const showDiscoverDrawer = ref(false)
const selectedDiscoverApp = ref<DiscoverApp | null>(null)
const checkingUpdates = ref(false)
const updatingAll = ref(false)

// Batch selection state
const selectedPackages = ref<Set<string>>(new Set())
const batchUpdating = ref(false)

// Uninstall state locks
const uninstallingSet = ref<Set<string>>(new Set())
const removingSet = ref<Set<string>>(new Set())

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
  const allNames = packagesStore.installed.map((p: any) => p.name)
  if (selectedPackages.value.size === allNames.length && allNames.every(n => selectedPackages.value.has(n))) {
    selectedPackages.value = new Set()
  } else {
    selectedPackages.value = new Set(allNames)
  }
  saveSelectedToConfig()
}

function isAllSelected(): boolean {
  const allNames = packagesStore.installed.map((p: any) => p.name)
  return allNames.length > 0 && allNames.every(n => selectedPackages.value.has(n))
}

function isIndeterminate(): boolean {
  const allNames = packagesStore.installed.map((p: any) => p.name)
  const count = allNames.filter(n => selectedPackages.value.has(n)).length
  return count > 0 && count < allNames.length
}

const selectedPackageNames = computed(() =>
  packagesStore.installed.filter((p: any) => selectedPackages.value.has(p.name)).map((p: any) => p.name)
)

function scrollLogToBottom() {
  nextTick(() => {
    if (pkgLogContainerRef.value) {
      pkgLogContainerRef.value.scrollTop = pkgLogContainerRef.value.scrollHeight
    }
  })
}

onMounted(() => {
  loadSelectedFromConfig()
  checkingUpdates.value = true
  packagesStore.loadUpdatable().finally(() => {
    checkingUpdates.value = false
  })
})

// 当已安装列表变化时，异步预加载图标
watch(() => packagesStore.installed.length, () => {
  if (packagesStore.installed.length > 0) {
    nextTick(preloadIcons)
  }
}, { immediate: true })

// Sync selected state: remove entries for packages that are no longer installed
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

function showPkgLogs(name: string) {
  activePkgLogName.value = name
  showPkgLogModal.value = true
  scrollLogToBottom()
}

const activePkgLogLines = computed(() => {
  if (!activePkgLogName.value) return []
  const p = pkgProgress.getProgress(activePkgLogName.value)
  return p ? p.logs : []
})

// 日志弹窗打开时，新日志自动滚底
watch(() => activePkgLogLines.value.length, () => {
  if (showPkgLogModal.value) scrollLogToBottom()
})

// ═══ 热门推荐（空状态用） ═══
const recommendedPackages = [
  { name: 'git', icon: 'G', desc: '版本控制', color: 'from-orange-500 to-red-500' },
  { name: 'nodejs', icon: 'N', desc: 'JavaScript 运行时', color: 'from-lime-500 to-green-500' },
  { name: '7zip', icon: '7', desc: '压缩工具', color: 'from-yellow-500 to-amber-500' },
  { name: 'neovim', icon: 'N', desc: '终端编辑器', color: 'from-green-600 to-emerald-600' },
]

async function handleInstall(name: string) {
  await packagesStore.install(name, { global: false, skipCheck: false, independent: false })
  message.success(`${name} 安装完成`)
}

// ═══ 商店行内安装 ═══
const storeInstallingSet = ref<Set<string>>(new Set())

async function storeQuickInstall(pkgName: string) {
  if (storeInstallingSet.value.has(pkgName)) return
  const s = new Set(storeInstallingSet.value)
  s.add(pkgName)
  storeInstallingSet.value = s
  pkgProgress.startUpdate(pkgName)
  try {
    await window.scoopAPI.install(pkgName, { global: false, skipCheck: false, independent: false })
    pkgProgress.finishUpdate(pkgName)
    message.success(`${pkgName} 安装完成`)
    packagesStore.loadInstalled()
  } catch {
    pkgProgress.failUpdate(pkgName)
    message.error(`${pkgName} 安装失败`)
  } finally {
    const next = new Set(storeInstallingSet.value)
    next.delete(pkgName)
    storeInstallingSet.value = next
  }
}

// ═══ 多版本发现抽屉 ═══
interface SearchVersionItem {
  manifestName: string
  version: string
  bucket: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseAndCleanSearch(rawText: string, baseName: string): SearchVersionItem[] {
  if (!rawText) return []
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const results: SearchVersionItem[] = []
  const escaped = escapeRegExp(baseName)
  const cleanRegex = new RegExp(`^${escaped}$|^${escaped}\\d+$|^${escaped}-(lts|nightly|current|rc)$`, 'i')
  const lineRegex = /^([\w.\-+]+)\s+(\S+)\s+(\S+)/
  let startParsing = false
  for (const line of lines) {
    if (/^-{3,}/.test(line)) { startParsing = true; continue }
    if (!startParsing) continue
    const m = line.match(lineRegex)
    if (!m) continue
    const [, manifestName, version, bucket] = m
    if (!cleanRegex.test(manifestName)) continue
    results.push({ manifestName, version, bucket })
  }
  return results.sort((a, b) => {
    if (a.manifestName.toLowerCase() === baseName.toLowerCase()) return -1
    if (b.manifestName.toLowerCase() === baseName.toLowerCase()) return 1
    return b.version.localeCompare(a.version, undefined, { numeric: true })
  })
}

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

async function openDiscoverDrawer(app: StoreApp) {
  showDiscoverDrawer.value = true
  discoverLoading.value = true
  selectedDiscoverApp.value = {
    id: app.name,
    name: app.name,
    description: app.desc,
    icon: app.icon,
    gradient: app.gradient,
    website: appWebsites[app.name] || '',
    versions: [],
  }
  try {
    const rawText = await window.scoopAPI.searchRaw(app.name)
    const cleaned = parseAndCleanSearch(rawText, app.name)
    selectedDiscoverApp.value = {
      id: app.name,
      name: app.name,
      description: app.desc,
      icon: app.icon,
      gradient: app.gradient,
      website: appWebsites[app.name] || '',
      versions: cleaned.map(r => ({
        version: r.version,
        bucket: r.bucket,
        manifestName: r.manifestName,
        isInstalled: installedNames.value.has(r.manifestName),
      })),
    }
  } catch {
    selectedDiscoverApp.value = buildFallbackDiscoverApp(app)
  } finally {
    discoverLoading.value = false
  }
}

function handleCardClick(app: StoreApp) {
  if (getMVEnabled(app)) {
    openDiscoverDrawer(app)
  } else if (!installedNames.value.has(app.name)) {
    storeQuickInstall(app.name)
  }
}

async function handleDiscoverInstall(manifestName: string) {
  if (storeInstallingSet.value.has(manifestName)) return
  const s = new Set(storeInstallingSet.value)
  s.add(manifestName)
  storeInstallingSet.value = s
  pkgProgress.startUpdate(manifestName)
  try {
    await window.scoopAPI.install(manifestName, { global: false, skipCheck: false, independent: false })
    pkgProgress.finishUpdate(manifestName)
    message.success(`${manifestName} 安装完成`)
    packagesStore.loadInstalled()
    // 刷新 drawer 内的已安装状态
    if (selectedDiscoverApp.value) {
      selectedDiscoverApp.value = { ...selectedDiscoverApp.value }
    }
  } catch {
    pkgProgress.failUpdate(manifestName)
    message.error(`${manifestName} 安装失败`)
  } finally {
    const next = new Set(storeInstallingSet.value)
    next.delete(manifestName)
    storeInstallingSet.value = next
  }
}

/**
 * 更新单个包的核心逻辑（单包/批量/全部更新共用）。
 * 执行 scoop update → 清除图标缓存 → 零延迟原地改写版本号 → 移除更新态 → 追踪行内进度。
 * @returns 更新是否成功
 */
async function updateSinglePackage(name: string): Promise<boolean> {
  pkgProgress.startUpdate(name)
  try {
    await window.scoopAPI.update(name)
    // 清除图标缓存，更新后重新提取（删除 key 以触发 fetchIcon 重新获取）
    await window.scoopAPI.clearAppIcon(name)
    const { [name]: _removed, ...restIcons } = iconMap.value
    iconMap.value = restIcons
    // 零延迟闪变：立即原地改写版本号 + 抹除更新态
    const newVer = getNewVersion(name)
    const pkgInList = packagesStore.installed.find((p) => p.name === name)
    if (pkgInList && newVer) pkgInList.version = newVer
    // 本地移除更新态（不等 reload）
    packagesStore.updatable = packagesStore.updatable.filter((p) => p.name !== name)
    pkgProgress.finishUpdate(name)
    return true
  } catch {
    pkgProgress.failUpdate(name)
    return false
  }
}

async function handleUpdate(pkg: any) {
  if (updatingPackages.value.has(pkg.name)) return
  const s = new Set(updatingPackages.value)
  s.add(pkg.name)
  updatingPackages.value = s
  try {
    const ok = await updateSinglePackage(pkg.name)
    if (!ok) {
      message.error(`更新 ${pkg.name} 失败`)
      return
    }
    // 后台静默刷新（不阻塞 UI 反馈）
    packagesStore.loadInstalled()
    packagesStore.loadUpdatable()
    // 异步重新获取图标
    fetchIcon(pkg.name)
  } finally {
    const s2 = new Set(updatingPackages.value)
    s2.delete(pkg.name)
    updatingPackages.value = s2
  }
}

async function handleUninstall(pkg: any) {
  if (uninstallingSet.value.has(pkg.name)) return
  const s = new Set(uninstallingSet.value)
  s.add(pkg.name)
  uninstallingSet.value = s
  try {
    await window.scoopAPI.uninstall(pkg.name, pkg.global)
    // 成功时静默处理：卡片滑出动画本身就是最好的反馈
    // Exit animation then remove from list
    const r = new Set(removingSet.value)
    r.add(pkg.name)
    removingSet.value = r
    await new Promise(resolve => setTimeout(resolve, 400))
    await packagesStore.loadInstalled()
    await packagesStore.loadUpdatable()
  } catch (e: any) {
    // 仅在失败时显示错误通知
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

/**
 * 批量更新一组包（勾选更新 / 全部更新共用）。
 * 逐个更新以独立追踪每个包的行内进度，完成后清空勾选并后台刷新。
 * @param names 待更新的包名列表
 * @param flag 对应的加载态 ref（batchUpdating 或 updatingAll）
 */
async function runBatchUpdate(names: string[], flag: Ref<boolean>) {
  if (names.length === 0) return
  flag.value = true
  // 为每个包启动行内进度并锁定
  const s = new Set(updatingPackages.value)
  for (const n of names) s.add(n)
  updatingPackages.value = s
  try {
    for (const name of names) {
      await updateSinglePackage(name)
    }
    selectedPackages.value = new Set()
    saveSelectedToConfig()
    // 后台静默刷新
    packagesStore.loadInstalled()
    packagesStore.loadUpdatable()
    // 异步重新获取所有更新包的图标
    for (const name of names) {
      fetchIcon(name)
    }
  } finally {
    flag.value = false
    updatingPackages.value = new Set()
  }
}

function handleBatchUpdate() {
  const names = selectedPackageNames.value
  if (names.length === 0) {
    message.warning('请先勾选需要更新的软件')
    return
  }
  runBatchUpdate(names, batchUpdating)
}

function handleUpdateAllConfirm() {
  const count = packagesStore.updatable.length
  if (count === 0) return
  dialog.warning({
    title: '确认全部更新',
    content: `是否确定更新全部 ${count} 个软件？这可能会消耗较多网络资源和时间。`,
    positiveText: '立即更新',
    negativeText: '取消',
    onPositiveClick: () => {
      const names = packagesStore.updatable.map((p) => p.name)
      runBatchUpdate(names, updatingAll)
    },
  })
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
  // 锁定所有选中卡片
  const s = new Set(uninstallingSet.value)
  for (const n of names) s.add(n)
  uninstallingSet.value = s

  let failed = 0
  for (const name of names) {
    try {
      const pkg = packagesStore.installed.find((p: any) => p.name === name)
      await window.scoopAPI.uninstall(name, pkg?.global || false)
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

  selectedPackages.value = new Set()
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
            <span class="font-semibold text-[14px] dark:text-zinc-50 text-gray-800 ml-5">应用管理</span>
          </template>
          <template #suffix>
            <div class="flex items-center gap-1 mr-3">
              <NButton size="tiny" secondary @click="openBucketDrawer" class="!rounded-app-sm">
                <template #icon><NIcon :component="Cube" size="14" /></template>
                软件源
              </NButton>
            </div>
          </template>

          <NTabPane name="installed" class="flex-1 overflow-hidden">
            <template #tab>
              <span class="text-[13px]">已安装</span>
              <span v-if="updatableNames.size > 0"
                class="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              >{{ updatableNames.size }}</span>
            </template>

            <!-- 初始加载状态 -->
            <div v-if="packagesStore.loading && packagesStore.installed.length === 0" class="flex justify-center py-8">
              <div class="flex flex-col items-center gap-2">
                <div class="w-5 h-5 border-2 border-t-transparent border-purple-500 rounded-full animate-spin" />
                <span class="text-[11px] font-normal dark:text-zinc-500 text-gray-400">加载中...</span>
              </div>
            </div>

            <!-- 空状态 -->
            <div v-else-if="packagesStore.installed.length === 0" class="flex flex-col h-full overflow-y-auto">
              <div class="flex flex-col items-center justify-center pt-10 pb-5 px-8 flex-shrink-0">
                <NEmpty description="暂无已安装的软件包">
                  <template #icon>
                    <NIcon :component="CubeOutline" size="48" class="dark:text-zinc-600 text-gray-300 text-slate-600" />
                  </template>
                  <template #extra>
                    <p class="text-[11px] font-normal dark:text-zinc-500 text-gray-400 mt-1">使用顶部搜索框查找并安装软件</p>
                  </template>
                </NEmpty>
              </div>
              <div class="flex-1 flex flex-col justify-end mt-4 mx-5 mb-4">
                <div class="bg-slate-50/70 dark:bg-gray-800/40 rounded-lg p-4 border border-slate-100/60 dark:border-gray-700/30">
                  <div class="flex items-center gap-2 mb-4">
                    <span class="text-[11px] font-semibold dark:text-zinc-500 text-slate-500 uppercase tracking-wider">热门推荐</span>
                    <div class="flex-1 h-px bg-slate-200/60 dark:bg-gray-700/40" />
                  </div>
                  <div class="grid grid-cols-4 gap-3">
                    <div v-for="pkg in recommendedPackages" :key="pkg.name"
                      class="flex flex-col items-center gap-2 p-3 rounded-lg bg-white dark:bg-gray-800/60 hover:bg-slate-50 dark:hover:bg-gray-700/50 border border-slate-100 dark:border-gray-700/40 shadow-sm hover:shadow-md transition-all duration-200 group"
                    >
                      <div class="w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform" :class="pkg.color">
                        <span class="text-white text-sm font-bold">{{ pkg.icon }}</span>
                      </div>
                      <span class="text-[12px] font-semibold dark:text-zinc-50 text-slate-800">{{ pkg.name }}</span>
                      <span class="text-[10px] font-normal dark:text-zinc-500 text-slate-400 -mt-1">{{ pkg.desc }}</span>
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
                class="sticky top-0 z-20 py-2 backdrop-blur-md border-b dark:border-white/[0.03] border-black/[0.04]"
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
                      <span class="text-[12px] font-normal dark:text-zinc-500 text-gray-500">检查中...</span>
                    </template>
                    <template v-else>
                      <button
                        :disabled="selectedPackageNames.length === 0 || batchUpdating"
                        @click="handleBatchUpdate"
                        class="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md border transition-all select-none"
                        :class="selectedPackageNames.length === 0
                          ? 'dark:border-white/[0.04] border-black/[0.06] bg-transparent dark:text-zinc-500 text-gray-500 cursor-not-allowed'
                          : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 cursor-pointer'"
                      >
                        <NIcon :component="DownloadOutline" :size="15" />
                        更新 ({{ selectedPackageNames.length }})
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
                        卸载 ({{ selectedPackageNames.length }})
                      </button>
                      <button
                        :disabled="packagesStore.updatable.length === 0 || updatingAll"
                        @click="handleUpdateAllConfirm"
                        class="flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded-md transition-colors select-none"
                        :class="packagesStore.updatable.length === 0
                          ? 'dark:text-zinc-500 text-gray-500 cursor-not-allowed'
                          : 'dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-white/[0.04] text-gray-600 hover:text-gray-800 hover:bg-black/[0.03] cursor-pointer'"
                      >
                        全部更新
                      </button>
                    </template>
                  </div>
                </div>
              </div>

              <!-- 已安装列表（纯净单色流风格） -->
              <div class="flex flex-col pt-2 pb-4">
                <TransitionGroup name="list" tag="div" class="flex flex-col">
                  <AppListItem
                    v-for="pkg in packagesStore.installed"
                    :key="pkg.name"
                    :pkg="pkg"
                    :mode="updatableNames.has(pkg.name) ? 'updatable' : 'installed'"
                    :checked="selectedPackages.has(pkg.name)"
                    :disabled="uninstallingSet.has(pkg.name)"
                    :new-version="getNewVersion(pkg.name)"
                    :progress="pkgProgress.getProgress(pkg.name)"
                    :icon="getIcon(pkg.name)"
                    @toggle-check="toggleSelect"
                    @update="handleUpdate"
                    @uninstall="handleUninstall"
                    @show-logs="showPkgLogs"
                  />
                </TransitionGroup>
              </div>
            </NScrollbar>
          </NTabPane>

          <NTabPane name="discover" tab="软件发现" class="flex-1 overflow-hidden">
            <div class="flex h-full overflow-hidden">
              <!-- ═══ 左侧分类导航 ═══ -->
              <div class="w-[140px] flex-shrink-0 border-r dark:border-white/[0.04] border-black/[0.06] py-2 overflow-y-auto custom-scrollbar">
                <div
                  v-for="cat in categories"
                  :key="cat.id"
                  class="flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer transition-colors duration-150 text-[12px]"
                  :class="activeCategoryId === cat.id
                    ? 'font-semibold dark:bg-white/[0.06] dark:text-zinc-50 bg-black/[0.06] text-gray-800'
                    : 'font-medium dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-white/[0.02] text-gray-600 hover:text-gray-800 hover:bg-black/[0.03]'"
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
                  <NIcon :component="activeCategory.icon" :size="15" class="dark:text-zinc-400 text-gray-500" />
                  <span class="text-[13px] font-semibold dark:text-zinc-50 text-gray-800">{{ activeCategory.name }}</span>
                  <span class="px-1.5 py-0.5 text-[10px] font-normal dark:bg-white/[0.04] bg-black/[0.04] dark:text-zinc-500 text-gray-500 rounded font-mono">{{ activeCategory.apps.length }}</span>
                </div>

                <!-- 应用卡片网格 -->
                <div class="grid grid-cols-2 gap-2.5">
                  <div
                    v-for="app in activeCategory.apps"
                    :key="app.name"
                    class="group relative flex items-center gap-3 p-3 rounded-lg dark:border-white/[0.04] dark:bg-white/[0.01] dark:hover:bg-white/[0.03] dark:hover:border-white/[0.08] border-black/[0.06] bg-black/[0.02] hover:bg-black/[0.04] hover:border-black/[0.12] transition-all duration-200"
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
                        <span class="font-mono text-[13px] font-semibold dark:text-zinc-50 text-gray-800 truncate">{{ app.name }}</span>
                        <span v-if="installedNames.has(app.name)" class="text-[10px] font-normal dark:text-zinc-500 text-gray-500 font-mono flex-shrink-0">已安装</span>
                        <span v-else-if="getMVEnabled(app)" class="text-[10px] font-normal text-violet-500/60 font-mono flex-shrink-0">多版</span>
                      </div>
                      <p class="text-[11px] font-medium dark:text-zinc-300 text-gray-600 truncate mt-0.5">{{ app.desc }}</p>
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
                          class="!text-gray-500 dark:hover:!text-white hover:!text-gray-800 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
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
                          : 'dark:text-gray-600 dark:hover:text-gray-400 dark:hover:bg-white/[0.04] text-gray-500 hover:text-gray-700 hover:bg-black/[0.04]'"
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

    <!-- === 右侧列：宽屏自适应撑宽，紧凑时保底 360px，宽屏最多撑到 460px === -->
    <div class="flex-1 w-full min-w-[360px] max-w-[460px] flex flex-col gap-5 h-full">
      <StorageEnvCard />
      <ProxyCard />
    </div>

    <BucketDrawer v-model:show="showBucketDrawer" />

    <AppDiscoverDrawer
      v-model:show="showDiscoverDrawer"
      :app="selectedDiscoverApp"
      :installed-names="installedNames"
      :installing-set="storeInstallingSet"
      :loading="discoverLoading"
      @install="handleDiscoverInstall"
    />

    <!-- 单包终端日志弹窗 -->
    <NModal
      v-model:show="showPkgLogModal"
      preset="card"
      :title="`${activePkgLogName} 执行日志`"
      style="width: 640px"
      :closable="true"
      :mask-closable="true"
      :close-on-esc="true"
    >
      <div class="flex items-center justify-between mb-3">
        <span class="text-[11px] font-normal dark:text-zinc-500 text-slate-500">共 {{ activePkgLogLines.length }} 行输出</span>
      </div>
      <div
        ref="pkgLogContainerRef"
        class="dark:bg-[#090a0d] bg-gray-100 p-4 rounded-lg dark:text-emerald-400 text-emerald-700 font-mono text-[11px] h-96 overflow-y-auto custom-scrollbar border dark:border-white/[0.06] border-black/[0.08]"
      >
        <div v-if="activePkgLogLines.length === 0" class="dark:text-zinc-600 text-slate-600 text-center py-8">
          暂无日志输出
        </div>
        <div v-for="(line, i) in activePkgLogLines" :key="i" class="whitespace-pre-wrap break-all leading-relaxed">
          <span class="dark:text-zinc-600 text-slate-600 mr-2 select-none">{{ String(i + 1).padStart(3, '0') }}</span>{{ line }}
        </div>
        <span v-if="updatingPackages.has(activePkgLogName)" class="inline-block w-2 h-4 bg-emerald-400/70 animate-pulse ml-1" />
      </div>
      <template #footer>
        <div class="flex justify-end">
          <NButton size="small" quaternary @click="showPkgLogModal = false" class="!rounded-md">关闭</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
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
  color: #1f2937; /* 亮色选中：text-gray-800 */
}
:where(.dark) .dashboard-tabs :deep(.n-tabs-tab--active .n-tabs-tab__label) {
  color: #fafafa; /* 暗色选中：text-zinc-50 */
}
</style>
