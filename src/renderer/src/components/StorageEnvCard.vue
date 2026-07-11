<template>
  <div class="flex flex-col gap-5">
    <!-- ═══════════════ Pod 1: Storage & Janitor ═══════════════ -->
    <div
      class="rounded-xl border p-4 space-y-4"
      :class="isDark ? 'bg-zinc-900/30 border-zinc-800/50' : 'bg-zinc-50 border-zinc-200'"
    >
      <!-- 头部说明 -->
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-semibold" :class="isDark ? 'text-zinc-200' : 'text-zinc-700'">📦 存储与系统瘦身</span>
        <div class="flex-1 h-px" :class="isDark ? 'bg-zinc-800/60' : 'bg-zinc-200/60'" />
      </div>

      <!-- 生态概览：软件源 + 已安装 并排卡片 -->
      <div class="grid grid-cols-2 gap-3">
        <div
          class="rounded-lg p-3 flex items-center gap-3"
          :class="isDark ? 'bg-zinc-800/30' : 'bg-white border border-zinc-200/70'"
        >
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-cyan-500/10' : 'bg-cyan-50'"
          >
            <span :class="isDark ? 'text-cyan-400' : 'text-cyan-600'">📂</span>
          </div>
          <div>
            <span class="text-[10px] font-normal text-zinc-500">软件源</span>
            <div class="flex items-baseline gap-1">
              <span class="font-mono text-lg font-bold" :class="isDark ? 'text-cyan-400' : 'text-cyan-600'">
                {{ settingsStore.bucketCount ?? '-' }}
              </span>
              <span class="text-[10px] text-zinc-500">个仓库</span>
            </div>
          </div>
        </div>
        <div
          class="rounded-lg p-3 flex items-center gap-3"
          :class="isDark ? 'bg-zinc-800/30' : 'bg-white border border-zinc-200/70'"
        >
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'"
          >
            <span :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">📦</span>
          </div>
          <div>
            <span class="text-[10px] font-normal text-zinc-500">已安装</span>
            <div class="flex items-baseline gap-1">
              <span class="font-mono text-lg font-bold" :class="isDark ? 'text-emerald-400' : 'text-emerald-600'">
                {{ settingsStore.installedCount ?? '-' }}
              </span>
              <span class="text-[10px] text-zinc-500">个应用</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 缓存 + 旧版本 双卡片网格 -->
      <div class="grid grid-cols-2 gap-3">
        <!-- 左：Cache 缓存包 -->
        <div
          class="rounded-lg p-3 flex flex-col gap-2"
          :class="isDark ? 'bg-zinc-800/30' : 'bg-white border border-zinc-200/70'"
        >
          <div class="flex items-center gap-1.5">
            <span :class="isDark ? 'text-zinc-500' : 'text-zinc-400'">📦</span>
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-zinc-200' : 'text-zinc-700'">缓存包</span>
          </div>
          <p class="text-[10px] leading-relaxed text-zinc-500">
            下载的安装包缓存文件，清理不影响已安装软件
          </p>
          <div class="flex items-end justify-between mt-auto">
            <div>
              <span class="font-mono text-[15px] font-bold" :class="isDark ? 'text-violet-400' : 'text-violet-600'">
                {{ cacheSizeDisplay }}
              </span>
              <span class="text-[11px] font-mono text-zinc-500 ml-1">/ {{ cacheFilesDisplay }}</span>
            </div>
            <NButton
              size="tiny"
              :loading="clearingCache"
              @click="handleClearCache"
              :bordered="false"
              class="!text-[11px] !px-2"
              :class="isDark ? '!text-amber-400 hover:!text-amber-300' : '!text-amber-600 hover:!text-amber-700'"
            >
              🗑️ 清理
            </NButton>
          </div>
        </div>
        <!-- 右：历史残留旧版本 -->
        <div
          class="rounded-lg p-3 flex flex-col gap-2"
          :class="isDark ? 'bg-zinc-800/30' : 'bg-white border border-zinc-200/70'"
        >
          <div class="flex items-center gap-1.5">
            <span :class="isDark ? 'text-zinc-500' : 'text-zinc-400'">🗑️</span>
            <span class="text-[12px] font-semibold" :class="isDark ? 'text-zinc-200' : 'text-zinc-700'">旧版本残留</span>
          </div>
          <p class="text-[10px] leading-relaxed text-zinc-500">
            更新后自动保留的旧版本文件，可安全清理释放空间
          </p>
          <div class="flex items-end justify-between mt-auto">
            <span class="font-mono text-[15px] font-bold" :class="isDark ? 'text-cyan-400' : 'text-cyan-600'">
              {{ oldVersionsDisplay }}
            </span>
            <NButton
              size="tiny"
              :loading="cleanupLoading"
              @click="handleCleanup"
              :bordered="false"
              class="!text-[11px] !px-2"
              :class="isDark ? '!text-emerald-400 hover:!text-emerald-300' : '!text-emerald-600 hover:!text-emerald-700'"
            >
              🧹 瘦身
            </NButton>
          </div>
        </div>
      </div>
      <!-- 下层资产长条：磁盘空间状态栏 -->
      <div class="space-y-1.5">
        <div class="flex justify-between text-[11px] font-mono">
          <span class="text-zinc-500">磁盘空间</span>
          <span class="font-medium" :class="isDark ? 'text-zinc-400' : 'text-zinc-500'">
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
          processing
        />
      </div>
    </div>

    <!-- ═══════════════ Pod 2: Network & Protocol ═══════════════ -->
    <div
      class="rounded-xl border p-4 space-y-4"
      :class="isDark ? 'bg-zinc-900/30 border-zinc-800/50' : 'bg-zinc-50 border-zinc-200'"
    >
      <!-- 头部行 1：网络代理开关 -->
      <div class="flex items-center justify-between">
        <span
          class="font-semibold text-sm"
          :class="isDark ? 'text-zinc-200' : 'text-zinc-700'"
        >
          🌐 网络代理 (Network Proxy)
        </span>
        <NSwitch
          v-model:value="proxyEnabled"
          :loading="proxyLoading"
          @update:value="toggleProxy"
          size="small"
        >
          <template #checked><span class="text-[10px]">ON</span></template>
          <template #unchecked><span class="text-[10px]">OFF</span></template>
        </NSwitch>
      </div>
      <!-- 滑出表单：一体化联邦胶囊舱 -->
      <NCollapseTransition :show="proxyEnabled">
        <div
          class="border rounded-lg overflow-hidden flex"
          :class="isDark ? 'border-zinc-700/60' : 'border-zinc-300'"
        >
          <NSelect
            v-model:value="proxyProtocol"
            :options="protocolOptions"
            size="small"
            :bordered="false"
            class="proxy-cell"
            style="width:25%"
          />
          <div
            class="w-px shrink-0"
            :class="isDark ? 'bg-zinc-700/50' : 'bg-zinc-300/50'"
          />
          <NInput
            v-model:value="proxyHost"
            placeholder="127.0.0.1"
            size="small"
            :bordered="false"
            class="proxy-cell"
            style="width:50%"
            :input-props="{ autocomplete: 'off' }"
          />
          <div
            class="w-px shrink-0"
            :class="isDark ? 'bg-zinc-700/50' : 'bg-zinc-300/50'"
          />
          <NInput
            v-model:value="proxyPort"
            placeholder="7890"
            size="small"
            :bordered="false"
            class="proxy-cell"
            style="width:25%"
            :input-props="{ autocomplete: 'off' }"
          />
        </div>
      </NCollapseTransition>
      <!-- 头部行 2：Aria2 下载加速开关 -->
      <div
        class="flex items-center justify-between pt-1"
        :class="isDark ? 'border-t border-white/5' : 'border-t border-zinc-100'"
      >
        <div class="flex items-center gap-2">
          <span
            class="font-semibold text-sm"
            :class="isDark ? 'text-zinc-200' : 'text-zinc-700'"
          >
            ⚡ Aria2 多线程加速
          </span>
          <span
            v-if="settingsStore.aria2Installed"
            class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
          />
        </div>
        <NSwitch
          v-if="settingsStore.aria2Installed"
          v-model:value="aria2EnabledLocal"
          :loading="settingsStore.aria2Loading"
          @update:value="toggleAria2"
          size="small"
        >
          <template #checked><span class="text-[10px]">ON</span></template>
          <template #unchecked><span class="text-[10px]">OFF</span></template>
        </NSwitch>
        <NButton
          v-else
          size="tiny"
          secondary
          :loading="aria2Installing"
          @click="handleInstallAria2"
        >
          安装
        </NButton>
      </div>
    </div>

    <!-- ═══════════════ Pod 3: Manifest Sync ═══════════════ -->
    <div
      class="rounded-xl border p-4 space-y-3"
      :class="isDark ? 'bg-zinc-900/30 border-zinc-800/50' : 'bg-zinc-50 border-zinc-200'"
    >
      <p class="text-[11px] leading-relaxed text-zinc-500">
        导出当前已安装的软件列表，或在重装系统、换新电脑时一键导入恢复。
      </p>
      <div class="grid grid-cols-2 gap-3">
        <NButton
          secondary
          :loading="exporting"
          @click="handleExport"
          class="!text-[12px]"
        >
          📤 导出配置清单
        </NButton>
        <NButton
          secondary
          :loading="importing"
          @click="handleImport"
          class="!text-[12px]"
        >
          📥 导入恢复软件
        </NButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, inject, type Ref } from 'vue'
import {
  NButton,
  NProgress,
  NSwitch,
  NSelect,
  NInput,
  NCollapseTransition,
  useMessage,
} from 'naive-ui'
import { useSettingsStore } from '@/stores/settings'
import { usePackagesStore } from '@/stores/packages'

const isDark = inject<Ref<boolean>>('isDark')
const message = useMessage()
const settingsStore = useSettingsStore()
const packagesStore = usePackagesStore()

// ── Proxy ──
const proxyEnabled = ref(false)
const proxyProtocol = ref<string>('http')
const proxyHost = ref('127.0.0.1')
const proxyPort = ref('7890')
const proxyLoading = ref(false)

const protocolOptions = [
  { label: 'HTTP', value: 'http' },
  { label: 'SOCKS5', value: 'socks5' },
]

// ── Aria2 ──
const aria2Installing = ref(false)
const aria2EnabledLocal = ref(false)

// ── Cache ──
const clearingCache = ref(false)

// ── Cleanup ──
const cleanupLoading = ref(false)
const oldVersionsSize = ref(0)

// ── Export / Import ──
const exporting = ref(false)
const importing = ref(false)

// ── Cache Display ──
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

// ── Old Versions Display ──
const oldVersionsDisplay = computed(() => {
  const bytes = oldVersionsSize.value
  if (bytes === 0) return '0 MB'
  if (bytes >= 1 << 30) return ((bytes / (1 << 30)) as number).toFixed(2) + ' GB'
  return ((bytes / (1 << 20)) as number).toFixed(1) + ' MB'
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

// ── Cache Actions ──
async function handleClearCache() {
  clearingCache.value = true
  try {
    await settingsStore.clearCache()
    await settingsStore.loadCacheInfo()
    message.success('缓存已清理')
  } catch {
    message.error('清理缓存失败')
  } finally {
    clearingCache.value = false
  }
}

// ── Cleanup Actions ──
async function loadOldVersionsSize() {
  try {
    const result = await window.scoopAPI.measureOldVersions()
    oldVersionsSize.value = result.bytes
  } catch {
    oldVersionsSize.value = 0
  }
}

async function handleCleanup() {
  cleanupLoading.value = true
  const loadingMsg = message.loading('正在清理旧版本...', { duration: 0 })
  try {
    const result = await window.scoopAPI.cleanup()
    await Promise.all([
      settingsStore.loadDiskSpace(),
      settingsStore.loadCacheInfo(),
    ])
    await loadOldVersionsSize()
    loadingMsg.destroy()
    const released = result?.released
    const skipped = result?.skipped || []
    if (skipped.length > 0) {
      const firstLocked = skipped[0]?.lockedPath || skipped[0]?.path
      const releasedText = released && released > 0 ? `已释放 ${formatBytes(released)}，` : ''
      message.warning(`${releasedText}${skipped.length} 个旧版本被占用，已安全跳过。稍后重试即可${firstLocked ? `：${firstLocked}` : ''}`)
    } else if (released && released > 0) {
      message.success(`已释放 ${formatBytes(released)} 磁盘空间`)
    } else {
      message.success('旧版本已清理完成')
    }
  } catch (e) {
    loadingMsg.destroy()
    message.error(`清理旧版本失败: ${(e as Error)?.message || '未知错误'}`)
  } finally {
    cleanupLoading.value = false
  }
}

// ── Proxy Actions ──
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

// ── Aria2 Actions ──
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

// ── Export / Import Actions ──
async function handleExport() {
  exporting.value = true
  try {
    const result = await window.scoopAPI.exportApps()
    if (!result.success) {
      if (!result.canceled) message.error('导出失败')
      return
    }
    message.success(`配置清单已导出至 ${result.path}`)
  } catch (e) {
    message.error((e as Error)?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

async function handleImport() {
  importing.value = true
  try {
    const result = await window.scoopAPI.importApps()
    if (!result.success) {
      if (!result.canceled) message.error('导入失败或已取消')
      return
    }
    message.success('软件列表已导入恢复完成')
    // 刷新已安装列表
    await settingsStore.loadDiskSpace()
  } catch (e: any) {
    if (e?.message?.includes('无效') || e?.message?.includes('JSON')) {
      message.error(e.message)
    } else {
      message.error(e?.message || '导入失败，请确认文件为有效 Scoop 配置清单')
    }
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  // 慢数据后台加载，不阻塞
  Promise.all([
    settingsStore.loadDiskSpace(),
    settingsStore.loadCacheInfo(),
    settingsStore.loadEcoStats(),
    loadOldVersionsSize(),
  ])

  // 等 proxy 和 Aria2 状态加载完后恢复 UI 开关
  await Promise.all([
    settingsStore.loadProxy(),
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

// ── 自动同步：安装/更新/卸载后刷新右侧数据卡片 ──
let syncTimer: ReturnType<typeof setTimeout> | null = null
watch([() => packagesStore.installed.length, () => packagesStore.updatable.length], () => {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(async () => {
    await Promise.all([
      settingsStore.loadDiskSpace(),
      settingsStore.loadCacheInfo(),
    ])
    await loadOldVersionsSize()
  }, 1500)
})
</script>

<style scoped>
/* ── Proxy 无缝拼接胶囊舱 ── */
.proxy-cell :deep(.n-base-selection),
.proxy-cell :deep(.n-base-selection--focus) {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  background: transparent !important;
}

.proxy-cell :deep(.n-input),
.proxy-cell :deep(.n-input--focus),
.proxy-cell :deep(.n-input--hover) {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  background: transparent !important;
}

/* NButton 图标跟随字体 */
:deep(.n-button .n-button__icon) {
  --n-icon-size: var(--app-font-size);
  font-size: var(--app-font-size);
}
:deep(.n-button .n-button__icon .n-icon),
:deep(.n-button .n-button__icon svg) {
  width: var(--app-font-size) !important;
  height: var(--app-font-size) !important;
}
</style>
