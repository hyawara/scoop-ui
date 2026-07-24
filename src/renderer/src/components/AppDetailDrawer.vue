<script setup lang="ts">
/**
 * AppDetailDrawer —— 全局复用的软件详情抽屉。
 *
 * 集成场景：
 *   1. 已安装列表：点击行 → 展示卸载 / 更新按钮。
 *   2. 软件发现（分类卡片）：点击卡片 → 展示安装按钮。
 *   3. 搜索结果：点击行 → 展示安装 / 卸载按钮。
 *
 * 数据补齐：
 *   传入的 pkg 若缺失 description / homepage / manifest，抽屉打开后会静默调用
 *   window.scoopAPI.fetchPackageInfo(name) 拉取完整 manifest 补齐展示。
 *
 * 交互按态分流：
 *   isInstalled === true  → 隐藏安装选项，仅显示 卸载 / 更新 操作。
 *   isInstalled === false → 显示安装选项开关，仅显示 安装 操作；开关值会随
 *                            @install 事件派发给父层，同时驱动"CLI 命令"实时拼装。
 */
import { ref, computed, watch } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NScrollbar,
  NButton,
  NCheckbox,
  NIcon,
  NPopover,
  NRadio,
  NRadioGroup,
  NTag,
  NSwitch,
  NSpace,
  NCollapse,
  NCollapseItem,
  NSkeleton,
  useMessage,
} from 'naive-ui'
import {
  DownloadOutline,
  TrashOutline,
  ArrowUpCircleOutline,
  SparklesOutline,
  OpenOutline,
  CopyOutline,
  CheckmarkDoneOutline,
  CubeOutline,
  TerminalOutline,
  GitNetworkOutline,
  DocumentTextOutline,
  OptionsOutline,
  CodeSlashOutline,
  CloseOutline,
} from '@vicons/ionicons5'
import type { InstallOptions } from '@/types'
import { APP_DRAWER_WIDTH } from '@/constants/layout'

/**
 * 详情抽屉接收的最小数据形状。所有可选字段抽屉都会尝试从 scoop:info 补齐。
 */
export interface AppDetailPayload {
  name: string
  version?: string
  bucket?: string
  global?: boolean
  description?: string
  homepage?: string
  license?: string
  /** 完整 Manifest JSON 对象；未提供时抽屉自动拉取。 */
  manifest?: Record<string, any> | null
  /** 图标（base64 或 file:// 均可），本轮重构头部已不再显示，仅保留以备扩展。 */
  icon?: string | null
}

const props = defineProps<{
  show: boolean
  pkg: AppDetailPayload | null
  /** 软件是否已安装：驱动"安装选项 显/隐"与"底部按钮 安装/卸载"分流。 */
  isInstalled?: boolean
  updatable?: boolean
  newVersion?: string
  /** 当前是否正在对该包执行安装 / 卸载 / 更新，用于禁用按钮与显示微型状态条。 */
  processing?: boolean
  /** 抽屉宽度，默认使用全局抽屉宽度。 */
  width?: number
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'install', name: string, options: InstallOptions): void
  (e: 'uninstall', name: string, global: boolean, options?: { purge?: boolean }): void
  (e: 'update', name: string, global?: boolean, options?: { useSudo?: boolean; isGlobal?: boolean; action?: 'update' | 'reinstall' }): void
  /** 点击某个依赖项，父层可用于跳转到该包的详情。 */
  (e: 'depend-click', dep: string): void
}>()

const message = useMessage()
type InstallMode = 'standard' | 'global'
const showInstallPopover = ref(false)
const showUpdatePopover = ref(false)
const showReinstallPopover = ref(false)
const showUninstallPopover = ref(false)
const installMode = ref<InstallMode>('standard')
const uninstallPurge = ref(false)

// ─── 安装选项（仅未安装时启用）───────────────────────
const installOptions = ref<InstallOptions>({
  global: false,
  skipCheck: false,
  independent: false,
  noUpdateScoop: true,
})

// ─── Manifest 自动补齐 ───────────────────────────────
const manifest = ref<Record<string, any> | null>(null)
const manifestLoading = ref(false)

async function loadManifestIfNeeded() {
  if (!props.pkg) return
  if (props.pkg.manifest) {
    manifest.value = props.pkg.manifest
    return
  }
  manifestLoading.value = true
  try {
    const info = await window.scoopAPI.fetchPackageInfo(props.pkg.name)
    manifest.value = (info as Record<string, any>) || null
  } catch {
    manifest.value = null
  } finally {
    manifestLoading.value = false
  }
}

watch(
  () => [props.show, props.pkg?.name] as const,
  ([show]) => {
    if (show && props.pkg) {
      manifest.value = null
      // 抽屉打开时重置安装选项，避免继承上一次残留
      installOptions.value = { global: false, skipCheck: false, independent: false, noUpdateScoop: true }
      loadManifestIfNeeded()
    }
  },
  { immediate: true }
)

// ─── 综合展示字段（外部 pkg 优先，manifest 兜底）─────
const displayDescription = computed(
  () => props.pkg?.description || manifest.value?.description || ''
)
const displayHomepage = computed(
  () => props.pkg?.homepage || manifest.value?.homepage || ''
)
const displayLicense = computed<string>(() => {
  const lic = props.pkg?.license ?? manifest.value?.license
  if (!lic) return ''
  if (typeof lic === 'string') return lic
  if (typeof lic === 'object' && 'identifier' in lic) return String((lic as any).identifier)
  return ''
})
const displayVersion = computed(
  () => props.pkg?.version || manifest.value?.version || ''
)

// ─── Manifest 结构性字段解析 ─────────────────────────
/**
 * 解析 manifest.bin：Scoop 允许三种形态并存，需要归一化为"用户装完能敲的命令名"数组。
 *   1. "node.exe"                    → ["node"]
 *   2. ["node.exe", "npm.cmd"]       → ["node", "npm"]
 *   3. [["node.exe", "node"], ...]   → ["node"]  // 第 2 项 alias 优先
 */
function stripExe(name: string): string {
  const base = name.split(/[\\/]/).pop() || name
  return base.replace(/\.(exe|cmd|bat|ps1)$/i, '')
}

const binaries = computed<string[]>(() => {
  const bin = manifest.value?.bin
  if (!bin) return []
  const items = Array.isArray(bin) ? bin : [bin]
  const cmds: string[] = []
  for (const item of items) {
    if (typeof item === 'string') {
      cmds.push(stripExe(item))
    } else if (Array.isArray(item)) {
      const exe = item[0]
      const alias = item[1]
      if (typeof alias === 'string' && alias.trim()) cmds.push(alias)
      else if (typeof exe === 'string') cmds.push(stripExe(exe))
    }
  }
  return Array.from(new Set(cmds)).filter(Boolean)
})

/**
 * 解析 manifest.depends：可能是 "extras/vcredist" 或 ["a", "b"]。
 */
const dependencies = computed<string[]>(() => {
  const deps = manifest.value?.depends
  if (!deps) return []
  const arr = Array.isArray(deps) ? deps : [deps]
  return arr.filter((v: unknown) => typeof v === 'string' && (v as string).trim()) as string[]
})

function normalizeManifestList(value: unknown): string[] {
  if (!value) return []
  const items = Array.isArray(value) ? value : [value]
  return items
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (Array.isArray(item)) {
        return item
          .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
          .join(' → ')
      }
      return ''
    })
    .filter(Boolean)
}

const persistEntries = computed(() => normalizeManifestList(manifest.value?.persist))
const envAddPathEntries = computed(() => normalizeManifestList(manifest.value?.env_add_path))
const hasPersist = computed(() => persistEntries.value.length > 0)
const hasEnvAddPath = computed(() => envAddPathEntries.value.length > 0)

// ─── CLI 命令实时拼装（供极客一键复制）───────────────
const installName = computed(() => {
  if (!props.pkg) return ''
  const bucket = props.pkg.bucket
  return bucket && bucket !== 'main' ? `${bucket}/${props.pkg.name}` : props.pkg.name
})

const cliCommand = computed(() => {
  if (!installName.value) return ''
  const parts = ['scoop install', installName.value]
  if (installOptions.value.global) parts.push('--global')
  if (installOptions.value.skipCheck) parts.push('--skip-hash-check')
  if (installOptions.value.independent) parts.push('--independent')
  if (installOptions.value.noUpdateScoop !== false) parts.push('--no-update-scoop')
  return parts.join(' ')
})

const manifestJson = computed(() => {
  if (!manifest.value) return ''
  try {
    return JSON.stringify(manifest.value, null, 2)
  } catch {
    return ''
  }
})

// ─── 交互 ────────────────────────────────────────────
function openHomepage() {
  if (!displayHomepage.value) return
  window.scoopAPI.openExternal(displayHomepage.value)
}

function installOptionsByMode(): InstallOptions {
  if (installMode.value === 'global') return { global: true, isGlobal: true }
  return {}
}

function handleInstall() {
  if (!props.pkg) return
  showInstallPopover.value = false
  emit('install', props.pkg.name, { ...installOptions.value, ...installOptionsByMode() })
  installMode.value = 'standard'
}

function handleUninstall() {
  if (!props.pkg) return
  showUninstallPopover.value = false
  emit('uninstall', props.pkg.name, props.pkg.global ?? false, uninstallPurge.value ? { purge: true } : undefined)
  uninstallPurge.value = false
}

function handleUpdate() {
  if (!props.pkg) return
  showUpdatePopover.value = false
  emit('update', props.pkg.name, props.pkg.global ?? false, { action: 'update' })
}

function handleReinstall() {
  if (!props.pkg) return
  showReinstallPopover.value = false
  emit('update', props.pkg.name, props.pkg.global ?? false, { action: 'reinstall' })
}

function handleDependClick(dep: string) {
  emit('depend-click', dep)
}

function closeDrawer() {
  emit('update:show', false)
}

const cliCopied = ref(false)
async function copyCli() {
  if (!cliCommand.value) return
  try {
    await navigator.clipboard.writeText(cliCommand.value)
    cliCopied.value = true
    message.success('命令已复制')
    setTimeout(() => { cliCopied.value = false }, 1500)
  } catch {
    message.error('复制失败')
  }
}

const manifestCopied = ref(false)
async function copyManifest() {
  if (!manifestJson.value) return
  try {
    await navigator.clipboard.writeText(manifestJson.value)
    manifestCopied.value = true
    message.success('Manifest 已复制')
    setTimeout(() => { manifestCopied.value = false }, 1500)
  } catch {
    message.error('复制失败')
  }
}
</script>

<template>
  <NDrawer
    :show="show"
    :width="width || APP_DRAWER_WIDTH"
    placement="right"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NDrawerContent content-class="!p-0 flex flex-col h-full overflow-hidden">
      <!-- ═══ Header：软件名 + 版本 + Bucket / 状态标签，去除首字母大头像 ═══ -->
      <template #header>
        <div class="flex items-center gap-3 w-full min-w-0 pr-10">
          <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <h2 class="text-[17px] font-bold dark:text-white/95 text-zinc-900 truncate leading-none">
              {{ pkg?.name || '软件详情' }}
            </h2>
            <span
              v-if="pkg && displayVersion"
              class="text-[12px] font-mono dark:text-slate-400 text-slate-500 flex-shrink-0 leading-none"
            >v{{ displayVersion }}</span>
            <div v-if="pkg" class="flex items-center gap-1.5 flex-shrink-0 min-w-0">
              <NTag
                v-if="pkg.bucket"
                size="small"
                :bordered="false"
                class="!bg-violet-500/15 !text-violet-400 font-mono"
              >{{ pkg.bucket }}</NTag>
              <NTag
                v-if="isInstalled"
                size="small"
                :bordered="false"
                class="!bg-emerald-500/15 !text-emerald-500"
              >已安装</NTag>
              <NTag
                v-else
                size="small"
                :bordered="false"
                class="dark:!bg-white/[0.06] !bg-black/[0.04] dark:!text-slate-300 !text-slate-600"
              >未安装</NTag>
              <NTag
                v-if="isInstalled && updatable"
                size="small"
                :bordered="false"
                class="!bg-amber-500/15 !text-amber-500"
              >可更新</NTag>
            </div>
          </div>

          <NButton
            quaternary
            circle
            size="small"
            aria-label="关闭"
            title="关闭"
            class="detail-close-btn !text-zinc-400/80 hover:!text-zinc-100 hover:!bg-zinc-800/60 transition-all duration-200"
            @click="closeDrawer"
          >
            <template #icon><NIcon :component="CloseOutline" size="14" /></template>
          </NButton>
        </div>
      </template>

      <!-- ═══ 无数据兜底 ═══ -->
      <div v-if="!pkg" class="flex-1 flex flex-col items-center justify-center text-gray-500">
        <NIcon :component="CubeOutline" size="40" class="opacity-30 mb-3" />
        <p class="text-sm">未选择软件</p>
      </div>

      <div v-else class="flex-1 flex flex-col overflow-hidden">
        <!-- ═══ Action Bar：紧跟头部，按 isInstalled 分流 ═══ -->
        <div v-if="!isInstalled" class="px-5 py-3 space-y-2">
          <NPopover v-model:show="showInstallPopover" trigger="click" placement="bottom-end" style="width: 288px; padding: 12px;">
            <template #trigger>
              <NButton
                type="primary"
                size="large"
                class="w-full !h-11 !rounded-xl !font-bold"
                :loading="processing"
                :disabled="processing"
              >
                <template #icon><NIcon :component="DownloadOutline" size="18" /></template>
                安装软件
              </NButton>
            </template>
            <div class="space-y-3">
              <div class="text-xs font-bold dark:text-zinc-200 text-zinc-800">安装 {{ pkg.name }} ({{ displayVersion || 'latest' }})</div>
              <NRadioGroup v-model:value="installMode" name="detail-install-mode" size="small">
                <div class="space-y-1.5">
                  <NRadio value="standard">标准安装 (Standard)</NRadio>
                  <NRadio value="global">🌐 全局安装 (-g)</NRadio>
                </div>
              </NRadioGroup>
              <div class="text-[12px] leading-5 dark:text-zinc-500 text-zinc-500">如果安装需要管理员权限，请以管理员身份启动 Scoop UI 后再安装。</div>
              <div class="flex justify-end gap-2 pt-2 border-t dark:border-zinc-700/40 border-zinc-200">
                <NButton size="tiny" quaternary @click="showInstallPopover = false; installMode = 'standard'">取消</NButton>
                <NButton size="tiny" type="primary" @click="handleInstall">确认安装</NButton>
              </div>
            </div>
          </NPopover>
        </div>

        <div v-else class="px-5 py-4">
          <div class="space-y-3 p-4 rounded-xl border dark:border-zinc-800/80 border-zinc-200/80 dark:bg-zinc-900/50 bg-white/65">
            <div :class="updatable ? 'flex items-center gap-2.5 w-full' : 'grid grid-cols-2 gap-3 w-full'">
              <NPopover
                v-if="updatable"
                v-model:show="showUpdatePopover"
                trigger="click"
                placement="bottom"
                style="width: 280px; padding: 12px;"
              >
                <template #trigger>
                  <button
                    type="button"
                    class="flex-1 h-10 flex items-center justify-center gap-1.5 px-4 rounded-lg bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30 hover:bg-amber-500/30 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="processing"
                    @click.stop
                  >
                    <NIcon :component="SparklesOutline" size="16" />
                    <span class="truncate">更新至 {{ newVersion || '最新版本' }}</span>
                  </button>
                </template>
                <div class="space-y-2.5">
                  <div class="text-xs font-bold dark:text-zinc-200 text-zinc-800">确认更新 {{ pkg.name }}？</div>
                  <div class="text-[12px] leading-5 dark:text-zinc-500 text-zinc-500">如果更新需要管理员权限，请以管理员身份启动 Scoop UI 后再更新。</div>
                  <div class="flex justify-end gap-2 pt-2 border-t dark:border-zinc-700/40 border-zinc-200">
                    <NButton size="tiny" quaternary @click="showUpdatePopover = false">取消</NButton>
                    <NButton size="tiny" type="primary" @click="handleUpdate">开始更新</NButton>
                  </div>
                </div>
              </NPopover>

              <NPopover v-model:show="showReinstallPopover" trigger="click" placement="bottom" style="width: 280px; padding: 12px;">
                <template #trigger>
                  <button
                    type="button"
                    class="h-10 flex items-center justify-center gap-1.5 px-4 rounded-lg dark:bg-zinc-800/80 bg-zinc-100 text-zinc-500 dark:text-zinc-300 border dark:border-zinc-700/50 border-zinc-200 hover:dark:bg-zinc-700/80 hover:bg-zinc-200/80 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="updatable ? '' : 'w-full'"
                    :disabled="processing"
                    @click.stop
                  >
                    <NIcon :component="ArrowUpCircleOutline" size="16" />
                    <span>{{ updatable ? '重装' : '强制重装' }}</span>
                  </button>
                </template>
                <div class="space-y-2.5">
                  <div class="text-xs font-bold dark:text-zinc-200 text-zinc-800">重新安装 {{ pkg.name }}</div>
                  <div class="text-[12px] leading-5 dark:text-zinc-500 text-zinc-500">如果重装需要管理员权限，请以管理员身份启动 Scoop UI 后再重装。</div>
                  <div class="flex justify-end gap-2 pt-2 border-t dark:border-zinc-700/40 border-zinc-200">
                    <NButton size="tiny" quaternary @click="showReinstallPopover = false">取消</NButton>
                    <NButton size="tiny" type="primary" @click="handleReinstall">确认重装</NButton>
                  </div>
                </div>
              </NPopover>

              <NPopover v-model:show="showUninstallPopover" trigger="click" placement="bottom-end" style="width: 280px; padding: 12px;">
                <template #trigger>
                  <button
                    type="button"
                    class="h-10 flex items-center justify-center gap-1.5 px-4 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    :class="updatable ? '' : 'w-full'"
                    :disabled="processing"
                    @click.stop
                  >
                    <NIcon :component="TrashOutline" size="16" />
                    <span>{{ updatable ? '卸载' : '卸载应用' }}</span>
                  </button>
                </template>
                <div class="space-y-2.5">
                  <div class="text-xs font-bold text-rose-400">确定要卸载 {{ pkg.name }} 吗？</div>
                  <NCheckbox v-model:checked="uninstallPurge">清除所有配置与缓存数据 (--purge)</NCheckbox>
                  <div class="flex justify-end gap-2 pt-2 border-t dark:border-zinc-700/40 border-zinc-200">
                    <NButton size="tiny" quaternary @click="showUninstallPopover = false; uninstallPurge = false">取消</NButton>
                    <NButton size="tiny" type="error" @click="handleUninstall">确认卸载</NButton>
                  </div>
                </div>
              </NPopover>
            </div>
          </div>
        </div>

        <!-- 微型进行中状态条 -->        <!-- 微型进行中状态条 -->
        <div
          v-if="processing"
          class="px-5 py-2 flex items-center gap-2 border-b dark:border-white/[0.04] border-black/[0.06] flex-shrink-0"
        >
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span class="text-[11px] text-emerald-500/90 font-mono">Scoop 正在处理 {{ pkg.name }}...</span>
        </div>

        <!-- ═══ Bento 信息卡片区（全局滚动） ═══ -->
        <NScrollbar class="flex-1">
          <div class="px-5 py-4 space-y-3">
            <!-- ─── 卡片 1：基本信息（描述 + 协议 + 主页） ─── -->
            <section class="rounded-xl border dark:border-white/[0.06] border-black/[0.06] dark:bg-white/[0.02] bg-black/[0.015] p-4">
              <h3 class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider dark:text-slate-400 text-gray-500 mb-2.5">
                <NIcon :component="DocumentTextOutline" size="12" />
                <span>基本信息</span>
              </h3>
              <div class="space-y-3">
                <div>
                  <p
                    v-if="displayDescription"
                    class="text-[13px] leading-relaxed dark:text-slate-200 text-gray-800"
                  >{{ displayDescription }}</p>
                  <NSkeleton v-else-if="manifestLoading" text :repeat="2" />
                  <p v-else class="text-[13px] dark:text-slate-500 text-gray-400 italic">暂无描述</p>
                </div>

                <div class="flex flex-wrap items-center gap-1.5 min-w-0">
                  <a
                    v-if="displayHomepage"
                    :href="displayHomepage"
                    class="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[12px] font-medium dark:bg-cyan-500/10 bg-cyan-50 dark:text-cyan-300 text-cyan-700 hover:dark:bg-cyan-500/15 hover:bg-cyan-100 transition-colors"
                    :title="displayHomepage"
                    @click.prevent="openHomepage"
                  >
                    <span>访问官网</span>
                    <NIcon :component="OpenOutline" size="12" />
                  </a>

                  <NTag
                    v-if="displayLicense"
                    size="small"
                    type="info"
                    :bordered="false"
                    class="font-mono"
                  >
                    License: {{ displayLicense }}
                  </NTag>

                  <NTag
                    v-if="hasPersist"
                    size="small"
                    type="success"
                    :bordered="false"
                    :title="persistEntries.join('\n')"
                  >
                    💾 本地数据已持久化
                  </NTag>

                  <NTag
                    v-if="hasEnvAddPath"
                    size="small"
                    type="warning"
                    :bordered="false"
                    :title="envAddPathEntries.join('\n')"
                  >
                    ⚙️ 安装后将自动配置系统环境变量
                  </NTag>

                  <NSkeleton
                    v-if="manifestLoading && !displayHomepage && !displayLicense && !hasPersist && !hasEnvAddPath"
                    :width="220"
                    :height="24"
                    :border-radius="6"
                  />
                </div>
              </div>
            </section>

            <!-- ─── 卡片 2：终端指令（bin 有值才显示） ─── -->
            <section
              v-if="binaries.length > 0"
              class="rounded-xl border dark:border-white/[0.06] border-black/[0.06] dark:bg-white/[0.02] bg-black/[0.015] p-4"
            >
              <h3 class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider dark:text-slate-400 text-gray-500 mb-2.5">
                <NIcon :component="TerminalOutline" size="12" />
                <span>终端指令</span>
                <span class="px-1.5 py-0.5 text-[10px] dark:bg-white/[0.04] bg-black/[0.04] rounded font-mono normal-case tracking-normal">
                  {{ binaries.length }}
                </span>
              </h3>
              <p class="text-[11px] dark:text-slate-500 text-gray-500 mb-2.5">
                安装后可直接在终端使用以下命令
              </p>
              <NSpace :size="[6, 6]">
                <NTag
                  v-for="cmd in binaries"
                  :key="cmd"
                  size="small"
                  :bordered="false"
                  class="!bg-cyan-500/10 !text-cyan-400 font-mono"
                >
                  <template #icon><NIcon :component="CodeSlashOutline" /></template>
                  {{ cmd }}
                </NTag>
              </NSpace>
            </section>

            <!-- ─── 卡片 3：依赖关系（depends 有值才显示） ─── -->
            <section
              v-if="dependencies.length > 0"
              class="rounded-xl border dark:border-white/[0.06] border-black/[0.06] dark:bg-white/[0.02] bg-black/[0.015] p-4"
            >
              <h3 class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider dark:text-slate-400 text-gray-500 mb-2.5">
                <NIcon :component="GitNetworkOutline" size="12" />
                <span>依赖关系</span>
                <span class="px-1.5 py-0.5 text-[10px] dark:bg-white/[0.04] bg-black/[0.04] rounded font-mono normal-case tracking-normal">
                  {{ dependencies.length }}
                </span>
              </h3>
              <p class="text-[11px] dark:text-slate-500 text-gray-500 mb-2.5">
                安装此软件时 Scoop 会自动处理以下依赖
              </p>
              <NSpace :size="[6, 6]">
                <NTag
                  v-for="dep in dependencies"
                  :key="dep"
                  size="small"
                  checkable
                  :bordered="false"
                  class="!bg-indigo-500/10 !text-indigo-400 font-mono cursor-pointer hover:!bg-indigo-500/20"
                  @click="handleDependClick(dep)"
                >
                  {{ dep }}
                </NTag>
              </NSpace>
            </section>

            <!-- ─── 卡片 4：安装选项（仅未安装时显示） ─── -->
            <section
              v-if="!isInstalled"
              class="rounded-xl border dark:border-white/[0.06] border-black/[0.06] dark:bg-white/[0.02] bg-black/[0.015] p-4"
            >
              <h3 class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider dark:text-slate-400 text-gray-500 mb-3">
                <NIcon :component="OptionsOutline" size="12" />
                <span>安装选项</span>
              </h3>
              <div class="space-y-2.5">
                <label class="flex items-center justify-between cursor-pointer">
                  <div class="flex flex-col">
                    <span class="text-[13px] dark:text-slate-200 text-gray-800">全局安装</span>
                    <span class="text-[10px] dark:text-slate-500 text-gray-500 font-mono">--global（所有用户可用）</span>
                  </div>
                  <NSwitch v-model:value="installOptions.global" size="small" />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <div class="flex flex-col">
                    <span class="text-[13px] dark:text-slate-200 text-gray-800">不在安装前同步源</span>
                    <span class="text-[10px] dark:text-slate-500 text-gray-500 font-mono">--no-update-scoop（避免安装被自更新阻塞）</span>
                  </div>
                  <NSwitch v-model:value="installOptions.noUpdateScoop" size="small" />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <div class="flex flex-col">
                    <span class="text-[13px] dark:text-slate-200 text-gray-800">跳过哈希检查</span>
                    <span class="text-[10px] dark:text-slate-500 text-gray-500 font-mono">--skip-hash-check（不校验文件完整性）</span>
                  </div>
                  <NSwitch v-model:value="installOptions.skipCheck" size="small" />
                </label>
                <label class="flex items-center justify-between cursor-pointer">
                  <div class="flex flex-col">
                    <span class="text-[13px] dark:text-slate-200 text-gray-800">独立安装</span>
                    <span class="text-[10px] dark:text-slate-500 text-gray-500 font-mono">--independent（跳过依赖）</span>
                  </div>
                  <NSwitch v-model:value="installOptions.independent" size="small" />
                </label>
              </div>
            </section>

            <!-- ─── 卡片 5：CLI 快捷复制（仅未安装时显示——已装的用户不需要再敲 install） ─── -->
            <section
              v-if="!isInstalled"
              class="rounded-xl border dark:border-white/[0.06] border-black/[0.06] dark:bg-white/[0.02] bg-black/[0.015] p-4"
            >
              <h3 class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider dark:text-slate-400 text-gray-500 mb-2.5">
                <NIcon :component="TerminalOutline" size="12" />
                <span>命令行安装</span>
              </h3>
              <p class="text-[11px] dark:text-slate-500 text-gray-500 mb-2.5">
                随上方开关实时更新，可直接复制到终端执行
              </p>
              <div class="flex items-center gap-2">
                <code
                  class="flex-1 min-w-0 text-[12px] font-mono dark:text-emerald-400 text-emerald-600 dark:bg-[#0b0c0e] bg-gray-50 border dark:border-white/[0.06] border-black/[0.06] rounded-md px-3 py-2 truncate select-all"
                  :title="cliCommand"
                >{{ cliCommand }}</code>
                <NButton size="small" secondary @click="copyCli">
                  <template #icon>
                    <NIcon
                      :component="cliCopied ? CheckmarkDoneOutline : CopyOutline"
                      size="14"
                      :class="cliCopied ? '!text-emerald-500' : ''"
                    />
                  </template>
                  {{ cliCopied ? '已复制' : '复制' }}
                </NButton>
              </div>
            </section>

            <!-- ─── 卡片 6：Manifest 折叠面板 ─── -->
            <section class="rounded-xl border dark:border-white/[0.06] border-black/[0.06] dark:bg-white/[0.02] bg-black/[0.015] overflow-hidden">
              <NCollapse arrow-placement="right" class="manifest-collapse">
                <NCollapseItem name="manifest">
                  <template #header>
                    <div class="flex items-center gap-1.5 py-0.5">
                      <NIcon :component="CodeSlashOutline" size="12" class="dark:text-slate-400 text-gray-500" />
                      <span class="text-[11px] font-semibold uppercase tracking-wider dark:text-slate-400 text-gray-500">
                        Manifest 详情
                      </span>
                      <span
                        v-if="!manifestLoading && manifestJson"
                        class="px-1.5 py-0.5 text-[10px] dark:bg-white/[0.04] bg-black/[0.04] dark:text-slate-500 text-gray-500 rounded font-mono"
                      >JSON</span>
                    </div>
                  </template>
                  <template #header-extra>
                    <button
                      v-if="manifestJson"
                      class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] dark:text-slate-500 text-gray-500 hover:dark:text-cyan-400 hover:text-cyan-600 transition-colors"
                      @click.stop="copyManifest"
                    >
                      <NIcon
                        :component="manifestCopied ? CheckmarkDoneOutline : CopyOutline"
                        size="12"
                        :class="manifestCopied ? '!text-emerald-500' : ''"
                      />
                      <span>{{ manifestCopied ? '已复制' : '复制' }}</span>
                    </button>
                  </template>

                  <div class="px-4 pb-4">
                    <div v-if="manifestLoading" class="space-y-2">
                      <NSkeleton text :repeat="4" />
                    </div>
                    <pre
                      v-else-if="manifestJson"
                      class="text-[11px] font-mono leading-relaxed dark:text-slate-300 text-gray-700 dark:bg-[#0b0c0e] bg-gray-50 border dark:border-white/[0.04] border-black/[0.06] rounded-lg p-3 overflow-x-auto whitespace-pre max-h-[320px] overflow-y-auto custom-scrollbar"
                    >{{ manifestJson }}</pre>
                    <p v-else class="text-[12px] dark:text-slate-500 text-gray-400 italic">
                      未能加载 Manifest 信息
                    </p>
                  </div>
                </NCollapseItem>
              </NCollapse>
            </section>
          </div>
        </NScrollbar>
      </div>

    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.manifest-collapse :deep(.n-collapse-item__header) {
  padding: 12px 16px !important;
}
.manifest-collapse :deep(.n-collapse-item__content-wrapper) {
  padding: 0 !important;
}
.manifest-collapse :deep(.n-collapse-item__content-inner) {
  padding-top: 0 !important;
}

.detail-close-btn {
  border: 1px solid transparent;
}

.detail-action-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
