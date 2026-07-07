<template>
  <NCard class="glass-card" content-class="flex flex-col gap-4 p-5">
    <!-- ========== Block 1: Micro Stat Badges ========== -->
    <div class="grid grid-cols-3 gap-2">
      <!-- Buckets -->
      <div
        class="stat-badge flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 min-w-0 transition-all duration-200 hover:scale-[1.02]"
        :class="isDark ? 'bg-zinc-900/60 border border-white/5' : 'bg-zinc-100 border border-zinc-200'"
      >
        <span class="font-mono text-[15px] font-bold leading-none tabular-nums" :class="isDark ? 'text-cyan-400' : 'text-cyan-600'">
          {{ settingsStore.bucketCount ?? '-' }}
        </span>
        <span class="text-[10px] leading-tight font-normal tracking-wide text-center" :class="isDark ? 'text-zinc-500' : 'text-zinc-400'">
          Buckets 软件源
        </span>
      </div>

      <!-- Apps -->
      <div
        class="stat-badge flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 min-w-0 transition-all duration-200 hover:scale-[1.02]"
        :class="isDark ? 'bg-zinc-900/60 border border-white/5' : 'bg-zinc-100 border border-zinc-200'"
      >
        <span class="font-mono text-[15px] font-bold leading-none tabular-nums" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">
          {{ settingsStore.installedCount ?? '-' }}
        </span>
        <span class="text-[10px] leading-tight font-normal tracking-wide text-center" :class="isDark ? 'text-zinc-500' : 'text-zinc-400'">
          Apps 已安装
        </span>
      </div>

      <!-- Cache -->
      <div
        class="stat-badge flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-3 min-w-0 transition-all duration-200 hover:scale-[1.02]"
        :class="isDark ? 'bg-zinc-900/60 border border-white/5' : 'bg-zinc-100 border border-zinc-200'"
      >
        <div class="flex items-baseline gap-1 min-w-0 flex-wrap justify-center">
          <span class="font-mono text-[15px] font-bold leading-none tabular-nums" :class="isDark ? 'text-violet-400' : 'text-violet-600'">
            {{ cacheSizeDisplay }}
          </span>
          <span
            v-if="cacheFilesDisplay"
            class="text-xs font-sans font-normal leading-none whitespace-nowrap"
            :class="isDark ? 'text-zinc-400' : 'text-zinc-500'"
          >/ {{ cacheFilesDisplay }}</span>
        </div>
        <span class="text-[10px] leading-tight font-normal tracking-wide text-center" :class="isDark ? 'text-zinc-500' : 'text-zinc-400'">
          Cache 缓存包
        </span>
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

    <!-- ========== Block 2.5: Mirror Source ========== -->
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

    <!-- ========== Block 3: Disk Space ========== -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between text-xs">
        <span :class="isDark ? 'text-zinc-400' : 'text-zinc-500'">磁盘空间</span>
        <span
          class="font-mono font-medium"
          :class="isDark ? 'text-zinc-300' : 'text-zinc-600'"
        >
          {{ diskUsedDisplay }} / {{ diskTotalDisplay }}
        </span>
      </div>
      <NProgress
        type="line"
        :percentage="diskPercentage"
        :height="6"
        :color="diskBarColor"
        :rail-color="diskRailColor"
        :show-indicator="false"
        :border-radius="4"
      />
    </div>

    <!-- ========== Block 4: Quick Actions ========== -->
    <div
      class="flex flex-col gap-3 rounded-xl p-4 transition-colors duration-200"
      :class="isDark ? 'bg-zinc-900/40 border border-white/5' : 'bg-white border border-zinc-200'"
    >
      <span
        class="text-[11px] font-medium uppercase tracking-wider"
        :class="isDark ? 'text-zinc-500' : 'text-zinc-400'"
      >
        快捷工具
      </span>

      <!-- Update Scoop -->
      <div class="flex flex-col gap-1">
        <NButton
          block
          secondary
          :loading="updatingScoop"
          :class="isDark ? 'hover:bg-cyan-500/10 hover:text-cyan-300' : 'hover:bg-cyan-50 hover:text-cyan-600'"
          @click="handleUpdateScoop"
        >
          <template #icon>
            <RefreshOutline :size="14" />
          </template>
          更新 Scoop 核心
        </NButton>
        <p
          class="px-1 leading-snug"
          :class="isDark ? 'text-zinc-600' : 'text-zinc-400'"
        >
          同步远程仓库，获取最新的软件清单与 CLI 主程序（不影响已安装应用）
        </p>
      </div>

      <!-- Clear Cache -->
      <div class="flex flex-col gap-1">
        <NButton
          block
          secondary
          :loading="clearingCache"
          :class="isDark ? 'hover:bg-emerald-500/10 hover:text-emerald-300' : 'hover:bg-emerald-50 hover:text-emerald-600'"
          @click="handleClearCache"
        >
          <template #icon>
            <TrashOutline :size="14" />
          </template>
          清理全部残留与缓存
        </NButton>
        <p
          class="px-1 leading-snug"
          :class="isDark ? 'text-zinc-600' : 'text-zinc-400'"
        >
          安全擦除历史卸载残留及已完成的安装包，释放磁盘空间
        </p>
      </div>

      <!-- Health Check -->
      <div class="flex flex-col gap-1">
        <NButton
          block
          secondary
          :loading="checkingUp"
          :class="isDark ? 'hover:bg-violet-500/10 hover:text-violet-300' : 'hover:bg-violet-50 hover:text-violet-600'"
          @click="handleCheckup"
        >
          <template #icon>
            <PulseOutline :size="14" />
          </template>
          运行系统环境健康检查
        </NButton>
        <p
          class="px-1 leading-snug"
          :class="isDark ? 'text-zinc-600' : 'text-zinc-400'"
        >
          扫描底层 Scoop 环境变量、断联的 Shim 指针及潜在的目录冲突
        </p>
      </div>
    </div>
  </NCard>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject, h, type Ref, type VNodeChild } from 'vue'
import {
  NCard,
  NButton,
  NProgress,
  NSwitch,
  NSelect,
  NInput,
  NCollapseTransition,
  NTooltip,
  useMessage,
  type SelectOption,
} from 'naive-ui'
import {
  GlobeOutline,
  ServerOutline,
  TrashOutline,
  RefreshOutline,
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
// ghproxy 加速节点：gh-proxy.com 实测最稳（0.75~0.95s）为首选，ghproxy.net 冷启动慢作备用
const GHPROXY_PREFIX = 'https://gh-proxy.com/'
// 自定义源前缀（用户手动输入的私有/高校镜像前缀，形如 https://your-proxy/）
const customPrefix = ref<string>('')

// ── Aria2 ──
const aria2Installing = ref(false)
const aria2EnabledLocal = ref(false)

// ── Quick Actions ──
const updatingScoop = ref(false)
const clearingCache = ref(false)
const checkingUp = ref(false)

// ── Options ──
const protocolOptions = [
  { label: 'HTTP', value: 'http' },
  { label: 'SOCKS5', value: 'socks5' },
]

// 镜像预设：仅保留实测可返回真实 git commit hash 的方案。
// geekhour.net/scoop/*.git 经核验为假源（返回 HTML 非 git 端点），gitee 社区源已停更，均已剔除以免误导。
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

// 下拉项自定义渲染：上行标题（font-medium）+ 下行精细描述（text-[11px] 弱化色）。
// 暗/亮两套对比度：标题 zinc-200/zinc-800，描述 zinc-500/zinc-400。
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

// 选中框渲染：只显示单行短标签（防截断），hover 时用 NTooltip 弹出完整描述。
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
  const raw = settingsStore.cacheInfo?.size ?? 0
  if (raw === 0) return '0 B'
  if (raw >= 1 << 30) return ((raw / (1 << 30)) as number).toFixed(1) + ' GB'
  if (raw >= 1 << 20) return ((raw / (1 << 20)) as number).toFixed(1) + ' MB'
  return ((raw / (1 << 10)) as number).toFixed(1) + ' KB'
})

const cacheFilesDisplay = computed(() => {
  const files = settingsStore.cacheInfo?.files ?? 0
  return files > 0 ? `${files} 个文件` : null
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
  // custom：先确保用户已填入合法前缀，否则不下发命令，仅展开输入框等待
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

  // 组装下发给后端的 payload：official 无前缀；ghproxy 用内置节点；custom 用用户输入
  const payload: { mirror: string; prefix?: string } =
    value === 'official'
      ? { mirror: 'official' }
      : value === 'ghproxy'
        ? { mirror: 'ghproxy', prefix: GHPROXY_PREFIX }
        : { mirror: 'custom', prefix: customPrefix.value.trim() }

  try {
    // 进入 loading，禁止重复点击（底层 git remote set-url 虽快，但串行多 bucket 仍需防抖）
    mirrorLoading.value = true

    // 后端串行 git remote set-url 无损换源，并内置 aria2 守护（换源前后比对，绝不动已开启的 aria2）
    const res = await window.scoopAPI.switchMirror(payload)

    if (!res.success) {
      message.error(res.error || '部分 bucket 换源失败')
      return
    }

    // 换源可能触发 scoop 重置，前端 store 再同步一次 aria2 真实状态用于 UI
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

// 自定义前缀输入框「应用」按钮：复用 applyMirror 的 custom 分支（含前缀校验 + 无损换源 + aria2 守护）
function applyCustomMirror() {
  return applyMirror('custom')
}

async function handleUpdateScoop() {
  try {
    updatingScoop.value = true
    await window.scoopAPI?.update()
    message.success('Scoop 已更新')
  } catch {
    message.error('更新失败')
  } finally {
    updatingScoop.value = false
  }
}

async function handleClearCache() {
  try {
    clearingCache.value = true
    await settingsStore.clearCache()
    await settingsStore.loadCacheInfo()
    message.success('缓存已清理')
  } catch {
    message.error('清理失败')
  } finally {
    clearingCache.value = false
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

/* 兜底：NButton 内部图标容器跟随全局正文字号 --app-font-size 同步缩放，
   用户在设置里调大/调小字体时，图标同步等比增减 */
:deep(.n-button .n-button__icon) {
  --n-icon-size: var(--app-font-size);
  font-size: var(--app-font-size);
}
:deep(.n-button .n-button__icon .n-icon),
:deep(.n-button .n-button__icon svg) {
  width: var(--app-font-size) !important;
  height: var(--app-font-size) !important;
}

/* 卡片标题图标（GlobeOutline / RocketOutline / ServerOutline）与正文字号同步 */
.header-icon {
  width: var(--app-font-size);
  height: var(--app-font-size);
}
.header-icon :deep(svg) {
  width: var(--app-font-size);
  height: var(--app-font-size);
}
</style>
