<template>
  <NCard class="glass-card" content-class="flex flex-col gap-4 p-5">
    <!-- ========== Block 1: Interactive Metric Cards ========== -->
    <!-- Buckets + Apps 在同一行 -->
    <div class="grid grid-cols-2 gap-2">
      <!-- Buckets - Hover 显示同步按钮 -->
      <div
        class="group stat-badge relative flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 min-w-0 transition-all duration-200 hover:scale-[1.02]"
        :class="isDark ? 'bg-zinc-900/60 border border-white/5' : 'bg-zinc-100 border border-zinc-200'"
      >
        <span
          class="font-mono text-[15px] font-bold leading-none tabular-nums"
          :class="isDark ? 'text-cyan-400' : 'text-cyan-600'"
          :style="{ fontFamily: 'var(--app-font-family)' }"
        >
          {{ settingsStore.bucketCount ?? '-' }}
        </span>
        <span
          class="text-[10px] leading-tight font-normal tracking-wide text-center"
          :class="isDark ? 'text-zinc-500' : 'text-zinc-400'"
          :style="{ fontFamily: 'var(--app-font-family)' }"
        >
          Buckets 软件源
        </span>
        <!-- Hover 操作按钮：同步 -->
        <button
          class="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
          :class="isDark ? 'bg-zinc-800 hover:bg-cyan-500/20 text-zinc-400 hover:text-cyan-400' : 'bg-zinc-200 hover:bg-cyan-50 text-zinc-500 hover:text-cyan-600'"
          :disabled="syncingBuckets"
          @click.stop="handleSyncBuckets"
        >
          <svg v-if="!syncingBuckets" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 16h5v5"/>
          </svg>
          <svg v-else class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        </button>
      </div>

      <!-- Apps - Hover 显示检查更新按钮 -->
      <div
        class="group stat-badge relative flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 min-w-0 transition-all duration-200 hover:scale-[1.02]"
        :class="isDark ? 'bg-zinc-900/60 border border-white/5' : 'bg-zinc-100 border border-zinc-200'"
      >
        <span
          class="font-mono text-[15px] font-bold leading-none tabular-nums"
          :class="isDark ? 'text-emerald-400' : 'text-emerald-600'"
          :style="{ fontFamily: 'var(--app-font-family)' }"
        >
          {{ settingsStore.installedCount ?? '-' }}
        </span>
        <span
          class="text-[10px] leading-tight font-normal tracking-wide text-center"
          :class="isDark ? 'text-zinc-500' : 'text-zinc-400'"
          :style="{ fontFamily: 'var(--app-font-family)' }"
        >
          Apps 已安装
        </span>
        <!-- Hover 操作按钮：检查更新 -->
        <button
          class="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
          :class="isDark ? 'bg-zinc-800 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400' : 'bg-zinc-200 hover:bg-emerald-50 text-zinc-500 hover:text-emerald-600'"
          :disabled="checkingUpdates"
          @click.stop="handleCheckUpdates"
        >
          <svg v-if="!checkingUpdates" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.3-4.3"/>
          </svg>
          <svg v-else class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Cache + 磁盘空间 组合 -->
    <div
      class="stat-badge flex flex-col gap-2 rounded-xl px-4 py-3 min-w-0 transition-all duration-200"
      :class="isDark ? 'bg-zinc-900/60 border border-white/5' : 'bg-zinc-100 border border-zinc-200'"
    >
      <!-- Cache 行 -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span
            class="font-mono text-[15px] font-bold leading-none tabular-nums"
            :class="isDark ? 'text-violet-400' : 'text-violet-600'"
            :style="{ fontFamily: 'var(--app-font-family)' }"
          >
            {{ cacheSizeDisplay }}
          </span>
          <span class="text-zinc-500">/</span>
          <span
            class="font-mono text-[12px] font-normal leading-none whitespace-nowrap"
            :class="isDark ? 'text-zinc-400' : 'text-zinc-500'"
            :style="{ fontFamily: 'var(--app-font-family)' }"
          >
            {{ cacheFilesDisplay }}
          </span>
          <span
            class="text-[10px] leading-tight font-normal tracking-wide"
            :class="isDark ? 'text-zinc-500' : 'text-zinc-400'"
            :style="{ fontFamily: 'var(--app-font-family)' }"
          >
            Cache 缓存包
          </span>
        </div>
        <!-- 清理缓存按钮 - 始终显示，点击二次确认 -->
        <NPopconfirm
          @positive-click="handleClearCacheStart"
        >
          <template #trigger>
            <button
              class="w-6 h-6 flex items-center justify-center rounded-md transition-all duration-200 hover:scale-110"
              :class="clearSuccess 
                ? (isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                : (isDark ? 'bg-zinc-800 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-400' : 'bg-zinc-200 hover:bg-amber-50 text-zinc-500 hover:text-amber-600')"
              :disabled="clearingCache"
            >
              <!-- 成功状态：绿色勾勾 -->
              <svg v-if="clearSuccess" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <!-- Loading 状态：旋转动画 -->
              <svg v-else-if="clearingCache" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <!-- 默认状态：垃圾桶 -->
              <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <path d="M10 11v6"/>
                <path d="M14 11v6"/>
              </svg>
            </button>
          </template>
          确认清理所有缓存文件？
        </NPopconfirm>
      </div>
      <!-- 磁盘空间行 -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-[11px]">
          <span :class="isDark ? 'text-zinc-500' : 'text-zinc-400'">磁盘空间</span>
          <span
            class="font-mono font-medium"
            :class="isDark ? 'text-zinc-400' : 'text-zinc-500'"
          >
            {{ diskUsedDisplay }} / {{ diskTotalDisplay }}
          </span>
        </div>
        <NProgress
          type="line"
          :percentage="diskPercentage"
          :height="4"
          :color="diskBarColor"
          :rail-color="diskRailColor"
          :show-indicator="false"
          :border-radius="2"
        />
      </div>
    </div>

    <!-- ========== Block 2: Network & Acceleration ========== -->
    <div
      class="flex flex-col gap-3 rounded-xl p-4 transition-colors duration-200"
      :class="isDark ? 'bg-zinc-900/40 border border-white/5' : 'bg-white border border-zinc-200'"
    >
      <!-- Proxy Toggle Row -->
      <div class="flex items-center justify-between min-h-[24px]">
        <div class="flex items-center gap-2 shrink-0">
          <GlobeOutline
            class="shrink-0 header-icon"
            :class="isDark ? 'text-zinc-400' : 'text-zinc-500'"
          />
          <span
            class="text-sm font-medium whitespace-nowrap"
            :class="isDark ? 'text-zinc-200' : 'text-zinc-700'"
          >网络代理</span>
        </div>
        <NSwitch
          v-model:value="proxyEnabled"
          :loading="proxyLoading"
          @update:value="toggleProxy"
        >
          <template #checked><span class="text-[10px]">ON</span></template>
          <template #unchecked><span class="text-[10px]">OFF</span></template>
        </NSwitch>
      </div>

      <!-- Proxy Form (collapsible) -->
      <NCollapseTransition :show="proxyEnabled">
        <div class="flex flex-col gap-2.5 pt-1">
          <div class="flex items-center gap-2">
            <NSelect
              v-model:value="proxyProtocol"
              :options="protocolOptions"
              size="small"
              class="proxy-select"
              :style="{ width: '90px' }"
            />
            <NInput
              v-model:value="proxyHost"
              placeholder="127.0.0.1"
              size="small"
              class="proxy-input flex-1"
              :input-props="{ autocomplete: 'off' }"
            />
            <NInput
              v-model:value="proxyPort"
              placeholder="7890"
              size="small"
              class="proxy-input"
              :style="{ width: '70px' }"
              :input-props="{ autocomplete: 'off' }"
            />
          </div>
          <NButton
            size="small"
            type="primary"
            secondary
            block
            :loading="proxyLoading"
            @click="applyProxy"
          >
            应用代理
          </NButton>
        </div>
      </NCollapseTransition>

      <!-- Aria2 Toggle Row -->
      <div
        class="flex items-center justify-between min-h-[24px]"
        :class="isDark ? 'border-t border-white/5 pt-3' : 'border-t border-zinc-100 pt-3'"
      >
        <div class="flex items-center gap-2 shrink-0">
          <RocketOutline
            class="shrink-0 header-icon"
            :class="isDark ? 'text-zinc-400' : 'text-zinc-500'"
          />
          <span
            class="text-sm font-medium whitespace-nowrap"
            :class="isDark ? 'text-zinc-200' : 'text-zinc-700'"
          >Aria2 加速</span>
          <span
            v-if="settingsStore.aria2Installed"
            class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse"
          />
        </div>
        <NSwitch
          v-if="settingsStore.aria2Installed"
          v-model:value="aria2EnabledLocal"
          :loading="settingsStore.aria2Loading"
          @update:value="toggleAria2"
        >
          <template #checked><span class="text-[10px]">ON</span></template>
          <template #unchecked><span class="text-[10px]">OFF</span></template>
        </NSwitch>
        <NButton
          v-else
          size="tiny"
          type="primary"
          secondary
          :loading="aria2Installing"
          @click="handleInstallAria2"
        >
          安装
        </NButton>
      </div>
    </div>

    <!-- ========== 分割线 ========== -->
    <div
      class="border-t"
      :class="isDark ? 'border-zinc-800/50' : 'border-zinc-200'"
    />

    <!-- ========== Block 3: Mirror Source ========== -->
    <div
      class="flex flex-col gap-3 rounded-xl p-4 transition-colors duration-200"
      :class="isDark ? 'bg-zinc-900/40 border border-white/5' : 'bg-white border border-zinc-200'"
    >
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 shrink-0">
          <ServerOutline
            class="shrink-0 header-icon"
            :class="isDark ? 'text-zinc-400' : 'text-zinc-500'"
          />
          <span
            class="text-sm font-medium whitespace-nowrap"
            :class="isDark ? 'text-zinc-200' : 'text-zinc-700'"
          >加速镜像源</span>
        </div>
        <NSelect
          v-model:value="mirrorSource"
          :options="mirrorOptions"
          :render-label="renderMirrorLabel"
          :render-tag="renderMirrorTag"
          :loading="mirrorLoading"
          :disabled="mirrorLoading"
          size="small"
          class="mirror-select"
          :style="{ width: '190px' }"
          @update:value="applyMirror"
        />
      </div>

      <!-- Custom mirror prefix input (collapsible, only for 'custom') -->
      <NCollapseTransition :show="mirrorSource === 'custom'">
        <div class="flex items-center gap-2 pt-0.5">
          <NInput
            v-model:value="customPrefix"
            placeholder="https://your-proxy.com/"
            size="small"
            class="proxy-input flex-1"
            :input-props="{ autocomplete: 'off' }"
            :disabled="mirrorLoading"
          />
          <NButton
            size="small"
            type="primary"
            secondary
            :loading="mirrorLoading"
            @click="applyCustomMirror"
          >
            应用
          </NButton>
        </div>
      </NCollapseTransition>
    </div>

    <!-- ========== Block 5: Health Check (Footer) ========== -->
    <NButton
      block
      secondary
      size="small"
      :loading="checkingUp"
      :class="isDark ? 'hover:bg-violet-500/10 hover:text-violet-300' : 'hover:bg-violet-50 hover:text-violet-600'"
      @click="handleCheckup"
    >
      <template #icon>
        <PulseOutline :size="14" />
      </template>
      运行系统环境健康检查
    </NButton>
  </NCard>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject, h, type Ref, type VNodeChild } from 'vue'
import {
  NCard,
  NButton,
  NProgress,
  NSwitch,
  NSelect,
  NInput,
  NCollapseTransition,
  NTooltip,
  NPopconfirm,
  useMessage,
  type SelectOption,
} from 'naive-ui'
import {
  GlobeOutline,
  ServerOutline,
  PulseOutline,
  RocketOutline,
} from '@vicons/ionicons5'
import { useSettingsStore } from '@/stores/settings'

const isDark = inject<Ref<boolean>>('isDark')
const message = useMessage()
const settingsStore = useSettingsStore()

// ── Proxy ──
const proxyEnabled = ref(false)
const proxyProtocol = ref<string>('http')
const proxyHost = ref('127.0.0.1')
const proxyPort = ref('7890')
const proxyLoading = ref(false)

// ── Mirror ──
const mirrorSource = ref<string>('official')
const mirrorLoading = ref(false)
const GHPROXY_PREFIX = 'https://gh-proxy.com/'
const customPrefix = ref<string>('')

// ── Aria2 ──
const aria2Installing = ref(false)
const aria2EnabledLocal = ref(false)

// ── Quick Actions ──
const clearingCache = ref(false)
const clearSuccess = ref(false)
let clearSuccessTimer: ReturnType<typeof setTimeout> | null = null
const checkingUp = ref(false)
const syncingBuckets = ref(false)
const checkingUpdates = ref(false)

// ── Options ──
const protocolOptions = [
  { label: 'HTTP', value: 'http' },
  { label: 'SOCKS5', value: 'socks5' },
]

interface MirrorOption extends SelectOption {
  label: string
  shortLabel: string
  value: string
  desc: string
}
const mirrorOptions: MirrorOption[] = [
  {
    label: '🌐 官方默认源 (GitHub Direct)',
    shortLabel: '🌐 官方默认源',
    value: 'official',
    desc: '直连 GitHub 官方仓库，适合已开启全局系统代理的用户。',
  },
  {
    label: '⚡ GHProxy 链路代理加速 (推荐)',
    shortLabel: '⚡ GHProxy 加速',
    value: 'ghproxy',
    desc: '为 GitHub 下载链接注入国内 CDN 前缀，与 aria2 多线程完美共存。',
  },
  {
    label: '🛠️ 自定义镜像源...',
    shortLabel: '🛠️ 自定义源',
    value: 'custom',
    desc: '手动输入你信任的私有或高校 Scoop 镜像前缀地址。',
  },
]

function renderMirrorLabel(option: SelectOption): VNodeChild {
  const dark = isDark?.value ?? true
  const desc = (option as MirrorOption).desc ?? ''
  return h(
    'div',
    { class: 'flex flex-col gap-0.5 py-1' },
    [
      h(
        'span',
        {
          class: 'font-medium leading-tight',
          style: {
            fontSize: 'var(--app-font-size)',
            color: dark ? '#e4e4e7' : '#27272a',
          },
        },
        String(option.label ?? ''),
      ),
      h(
        'span',
        {
          class: 'font-normal leading-snug',
          style: {
            fontSize: '11px',
            color: dark ? '#71717a' : '#a1a1aa',
          },
        },
        desc,
      ),
    ],
  )
}

function renderMirrorTag(props: { option: SelectOption }): VNodeChild {
  const opt = props.option as MirrorOption
  const short = opt.shortLabel ?? String(opt.label ?? '')
  const desc = opt.desc ?? ''
  return h(
    NTooltip,
    { trigger: 'hover', placement: 'top', style: { maxWidth: '260px' } },
    {
      trigger: () =>
        h(
          'span',
          {
            class: 'whitespace-nowrap overflow-hidden text-ellipsis',
            style: { fontSize: 'var(--app-font-size)' },
          },
          short,
        ),
      default: () => desc,
    },
  )
}

const cacheSizeDisplay = computed(() => {
  const size = settingsStore.cacheInfo?.size ?? 0
  const unit = settingsStore.cacheInfo?.unit ?? 'MB'
  if (size === 0) return '0 MB'
  return `${size} ${unit}`
})

const cacheFilesDisplay = computed(() => {
  const files = settingsStore.cacheInfo?.files ?? 0
  return files > 0 ? `${files} 个文件` : '0 个文件'
})

// ── Disk ──
const diskPercentage = computed(() => {
  const used = settingsStore.diskSpace?.Used ?? 0
  const free = settingsStore.diskSpace?.Free ?? 0
  const total = used + free
  if (total === 0) return 0
  return Math.round((used / total) * 100)
})

const diskUsedDisplay = computed(() => formatBytes(settingsStore.diskSpace?.Used ?? 0))

const diskTotalDisplay = computed(() => {
  const used = settingsStore.diskSpace?.Used ?? 0
  const free = settingsStore.diskSpace?.Free ?? 0
  return formatBytes(used + free)
})

const diskBarColor = computed(() => {
  const pct = diskPercentage.value
  if (pct > 90) return '#ef4444'
  if (pct > 75) return '#f59e0b'
  return isDark?.value ? '#06b6d4' : '#0891b2'
})

const diskRailColor = computed(() =>
  isDark?.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
)

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes >= 1 << 30) return ((bytes / (1 << 30)) as number).toFixed(2) + ' GB'
  if (bytes >= 1 << 20) return ((bytes / (1 << 20)) as number).toFixed(1) + ' MB'
  return ((bytes / (1 << 10)) as number).toFixed(1) + ' KB'
}

// ── Card Actions ──
async function handleSyncBuckets() {
  try {
    syncingBuckets.value = true
    await settingsStore.loadEcoStats()
    message.success('软件源已同步')
  } catch {
    message.error('同步失败')
  } finally {
    syncingBuckets.value = false
  }
}

async function handleCheckUpdates() {
  try {
    checkingUpdates.value = true
    message.info('正在检查更新…')
    await window.scoopAPI?.update?.()
    message.success('检查完成')
  } catch {
    message.error('检查失败')
  } finally {
    checkingUpdates.value = false
  }
}

function handleClearCacheStart() {
  clearingCache.value = true
  handleClearCache()
}

async function handleClearCache() {
  try {
    await settingsStore.clearCache()
    await settingsStore.loadCacheInfo()
    clearingCache.value = false
    clearSuccess.value = true
    if (clearSuccessTimer) clearTimeout(clearSuccessTimer)
    clearSuccessTimer = setTimeout(() => {
      clearSuccess.value = false
    }, 2000)
  } catch {
    clearingCache.value = false
    message.error('清理失败')
  }
}

async function handleCheckup() {
  try {
    checkingUp.value = true
    message.info('正在检查环境健康…')
    await window.scoopAPI?.update?.()
    message.success('环境检查完成')
  } catch {
    message.error('健康检查失败')
  } finally {
    checkingUp.value = false
  }
}

// ── Actions ──
async function toggleProxy(enabled: boolean) {
  try {
    proxyLoading.value = true
    if (enabled) {
      await applyProxy()
    } else {
      await settingsStore.removeProxy()
      message.success('代理已关闭')
    }
  } catch {
    message.error('操作失败')
  } finally {
    proxyLoading.value = false
  }
}

async function applyProxy() {
  if (!proxyHost.value || !proxyPort.value) {
    message.warning('请填写代理地址和端口')
    return
  }
  try {
    proxyLoading.value = true
    await settingsStore.setProxyConfig(
      proxyProtocol.value as 'http' | 'socks5',
      proxyHost.value,
      proxyPort.value,
    )
    message.success('代理已应用')
  } catch {
    message.error('代理设置失败')
  } finally {
    proxyLoading.value = false
  }
}

async function applyMirror(value: string) {
  if (value === 'custom') {
    const prefix = customPrefix.value.trim()
    if (!prefix) {
      message.info('请在下方输入自定义镜像前缀后回车应用')
      return
    }
    if (!/^https:\/\/[\w.\-]+(:\d+)?\//.test(prefix)) {
      message.warning('自定义前缀需以 https:// 开头且包含路径')
      return
    }
  }

  const payload: { mirror: string; prefix?: string } =
    value === 'official'
      ? { mirror: 'official' }
      : value === 'ghproxy'
        ? { mirror: 'ghproxy', prefix: GHPROXY_PREFIX }
        : { mirror: 'custom', prefix: customPrefix.value.trim() }

  try {
    mirrorLoading.value = true
    const res = await window.scoopAPI.switchMirror(payload)

    if (!res.success) {
      message.error(res.error || '部分 bucket 换源失败')
      return
    }

    await settingsStore.checkAria2()

    const aria2Hint = settingsStore.aria2Installed
      ? '，已无缝对接 aria2 多线程加速器'
      : ''
    const restoreHint = res.aria2Restored ? '（已自动恢复 aria2 开关）' : ''
    message.success(`镜像源已切换：${res.switched}/${res.total} 个 bucket${aria2Hint}${restoreHint}`)
  } catch {
    message.error('切换镜像源失败')
  } finally {
    mirrorLoading.value = false
  }
}

function applyCustomMirror() {
  return applyMirror('custom')
}

async function toggleAria2(enabled: boolean) {
  try {
    await settingsStore.setAria2Enabled(enabled)
    message.success(enabled ? 'Aria2 已启用' : 'Aria2 已禁用')
  } catch {
    message.error('操作失败')
  }
}

async function handleInstallAria2() {
  try {
    aria2Installing.value = true
    await settingsStore.installAria2()
    message.success('Aria2 安装成功')
  } catch {
    message.error('Aria2 安装失败')
  } finally {
    aria2Installing.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    settingsStore.loadDiskSpace(),
    settingsStore.loadCacheInfo(),
    settingsStore.loadEcoStats(),
    settingsStore.checkAria2(),
  ])

  if (settingsStore.proxy?.enabled) {
    proxyEnabled.value = true
    const addr = settingsStore.proxy.address || ''
    const match = addr.match(/^(\w+):\/\/(.+):(\d+)$/)
    if (match) {
      proxyProtocol.value = match[1]
      proxyHost.value = match[2]
      proxyPort.value = match[3]
    }
  }

  aria2EnabledLocal.value = settingsStore.aria2Enabled
})

onUnmounted(() => {
  if (clearSuccessTimer) clearTimeout(clearSuccessTimer)
})
</script>

<style scoped>
:deep(.n-card.glass-card) {
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

:deep(.n-card.glass-card:hover) {
  border-color: rgba(6, 182, 212, 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.n-card__content) {
  padding: 0;
}

/* Proxy form compact sizing */
:deep(.proxy-select .n-base-selection),
:deep(.proxy-input .n-input) {
  font-size: var(--app-font-size) !important;
  border-radius: 10px !important;
}

:deep(.mirror-select .n-base-selection) {
  font-size: var(--app-font-size) !important;
  border-radius: 10px !important;
}

/* Light mode overrides */
:deep(.n-base-selection:not(.n-base-selection--disabled):not(.n-base-selection--active):hover) {
  border-color: var(--primary) !important;
}

@media (prefers-color-scheme: light) {
  :deep(.proxy-select .n-base-selection),
  :deep(.mirror-select .n-base-selection) {
    background-color: #ffffff !important;
    border-color: #e4e4e7 !important;
    color: #27272a !important;
  }

  :deep(.proxy-input .n-input) {
    background-color: #ffffff !important;
  }
}

@media (prefers-color-scheme: dark) {
  :deep(.proxy-select .n-base-selection),
  :deep(.mirror-select .n-base-selection) {
    background-color: rgba(255, 255, 255, 0.05) !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
    color: #e4e4e7 !important;
  }

  :deep(.proxy-input .n-input) {
    background-color: rgba(255, 255, 255, 0.05) !important;
  }
}

.stat-badge {
  user-select: none;
  cursor: default;
}

/* 兜底：NButton 内部图标容器跟随全局正文字号 --app-font-size 同步缩放 */
:deep(.n-button .n-button__icon) {
  --n-icon-size: var(--app-font-size);
  font-size: var(--app-font-size);
}
:deep(.n-button .n-button__icon .n-icon),
:deep(.n-button .n-button__icon svg) {
  width: var(--app-font-size) !important;
  height: var(--app-font-size) !important;
}

/* 卡片标题图标与正文字号同步 */
.header-icon {
  width: var(--app-font-size);
  height: var(--app-font-size);
}
.header-icon :deep(svg) {
  width: var(--app-font-size);
  height: var(--app-font-size);
}
</style>
