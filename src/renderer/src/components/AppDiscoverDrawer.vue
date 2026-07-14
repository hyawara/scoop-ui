<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NDrawer,
  NDrawerContent,
  NButton,
  NIcon,
  NTag,
  NTooltip,
  useMessage,
} from 'naive-ui'
import {
  GlobeOutline,
  CopyOutline,
  DownloadOutline,
  CheckmarkDoneOutline,
  CubeOutline,
  RefreshOutline,
} from '@vicons/ionicons5'
import type { DiscoverApp, AppVersion } from '@/types'

const props = defineProps<{
  show: boolean
  app: DiscoverApp | null
  installedNames: Set<string>
  installingSet: Set<string>
  resettingSet: Set<string>
  activeVersionName?: string | null
  loading?: boolean
  refreshing?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'install', manifestName: string): void
  (e: 'reset', manifestName: string, familyKey: string): void
}>()

const message = useMessage()
const copiedVer = ref<string | null>(null)
const selectedVersionKey = ref<string | null>(null)

function handleClose() {
  emit('update:show', false)
}

function openWebsite(url: string) {
  window.scoopAPI.openExternal(url)
}

function getInstallName(version: AppVersion): string {
  return version.bucket === 'main'
    ? version.manifestName
    : `${version.bucket}/${version.manifestName}`
}

function getVersionKey(version: AppVersion): string {
  return `${version.bucket}:${version.manifestName}:${version.version}`
}

const versionsWithStatus = computed(() => {
  if (!props.app) return []
  return props.app.versions.map(v => ({
    ...v,
    isInstalled: props.installedNames.has(v.manifestName),
  }))
})

const selectedVersion = computed(() => {
  if (versionsWithStatus.value.length === 0) return null
  return versionsWithStatus.value.find(v => getVersionKey(v) === selectedVersionKey.value)
    || versionsWithStatus.value[0]
})

watch(
  () => props.app?.id,
  () => {
    selectedVersionKey.value = null
  },
)

watch(
  versionsWithStatus,
  (versions) => {
    if (versions.length === 0) {
      selectedVersionKey.value = null
      return
    }

    if (!selectedVersionKey.value || !versions.some(v => getVersionKey(v) === selectedVersionKey.value)) {
      selectedVersionKey.value = getVersionKey(versions[0])
    }
  },
  { immediate: true },
)

function selectVersion(version: AppVersion) {
  selectedVersionKey.value = getVersionKey(version)
}

function isVersionSelected(version: AppVersion): boolean {
  return selectedVersion.value ? getVersionKey(selectedVersion.value) === getVersionKey(version) : false
}

function handleInstall(version: AppVersion) {
  const installName = getInstallName(version)
  if (props.installingSet.has(installName)) return
  emit('install', installName)
}

function handleReset(version: AppVersion) {
  if (props.resettingSet.has(version.manifestName)) return
  emit('reset', version.manifestName, props.app?.id || version.manifestName)
}

function isActiveVersion(version: AppVersion): boolean {
  return props.activeVersionName === version.manifestName
}

async function copyCmd(version: AppVersion) {
  const cmd = `scoop install ${getInstallName(version)}`
  try {
    await navigator.clipboard.writeText(cmd)
    copiedVer.value = version.version
    message.success(`命令已复制`)
    setTimeout(() => {
      if (copiedVer.value === version.version) copiedVer.value = null
    }, 2000)
  } catch {
    message.error('复制失败')
  }
}

async function copyMainCmd() {
  if (!props.app || !selectedVersion.value) return
  const cmd = `scoop install ${getInstallName(selectedVersion.value)}`
  try {
    await navigator.clipboard.writeText(cmd)
    message.success(`命令已复制: ${cmd}`)
  } catch {
    message.error('复制失败')
  }
}
</script>

<template>
  <NDrawer
    v-model:show="props.show"
    :width="530"
    placement="right"
    @update:show="handleClose"
  >
    <NDrawerContent closable content-class="!p-0 flex flex-col h-full overflow-hidden">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="text-base font-semibold text-white/90">软件详情</span>
          <span v-if="app" class="px-1.5 py-0.5 text-[11px] dark:bg-white/[0.04] bg-black/[0.03] dark:text-gray-400 text-gray-500 rounded-md font-mono leading-none">{{ app.versions.length }} 个版本</span>
          <!-- 后台静默刷新：微型转圈，缓存秒开后无感同步最新版本 -->
          <span
            v-if="refreshing"
            class="ml-0.5 w-3.5 h-3.5 border-[1.5px] border-t-transparent border-indigo-400/80 rounded-full animate-spin"
            title="正在同步最新版本…"
          />
        </div>
      </template>

      <!-- ═══ Loading 态 ═══ -->
      <div v-if="loading && (!app || app.versions.length === 0)" class="flex-1 flex flex-col items-center justify-center text-gray-500">
        <div class="w-6 h-6 border-2 border-t-transparent border-indigo-400 rounded-full animate-spin mb-3" />
        <p class="text-sm text-gray-500">正在搜索可用版本...</p>
      </div>

      <div v-else-if="app" class="flex-1 flex flex-col overflow-hidden">
        <div class="px-5 pt-4 pb-3 flex items-start gap-4 border-b dark:border-white/[0.04] border-black/[0.06]">
          <div
            class="w-14 h-14 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 shadow-lg"
            :class="app.gradient"
          >
            <span class="text-white text-xl font-bold">{{ app.icon }}</span>
          </div>
          <div class="flex-1 min-w-0 pt-0.5">
            <h2 class="text-lg font-bold text-white/90 truncate">{{ app.name }}</h2>
            <p class="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{{ app.description }}</p>
            <div
              v-if="selectedVersion"
              class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-mono"
            >
              <span class="px-1.5 py-0.5 rounded-md dark:bg-indigo-500/10 bg-indigo-500/10 dark:text-indigo-300 text-indigo-600">
                {{ selectedVersion.version }}
              </span>
              <span class="px-1.5 py-0.5 rounded-md dark:bg-white/[0.04] bg-black/[0.04] dark:text-zinc-400 text-zinc-500">
                {{ selectedVersion.bucket }}
              </span>
              <span class="px-1.5 py-0.5 rounded-md dark:bg-white/[0.04] bg-black/[0.04] dark:text-zinc-400 text-zinc-500 truncate max-w-[260px]">
                {{ selectedVersion.manifestName }}
              </span>
              <NTag
                v-if="selectedVersion.isInstalled"
                size="small"
                :bordered="false"
                class="!h-[20px] !px-1.5 !bg-emerald-500/12 !text-emerald-400"
              >
                已安装
              </NTag>
              <NTag
                v-if="isActiveVersion(selectedVersion)"
                size="small"
                :bordered="false"
                class="!h-[20px] !px-1.5 !bg-cyan-500/12 !text-cyan-400"
              >
                活动
              </NTag>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
          <!-- Loading 中 -->
          <div v-if="loading" class="flex flex-col items-center justify-center py-12 text-gray-500">
            <div class="w-5 h-5 border-2 border-t-transparent border-indigo-400 rounded-full animate-spin mb-3" />
            <p class="text-xs text-gray-500">正在搜索可用版本...</p>
          </div>

          <!-- 空结果 -->
          <div v-else-if="versionsWithStatus.length === 0" class="flex flex-col items-center justify-center py-12 text-gray-500">
            <p class="text-sm">未找到可用版本</p>
          </div>

          <!-- 版本列表 -->
          <template v-else>
            <div class="flex items-center gap-2 mb-3">
              <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">可用版本</span>
              <span class="px-1.5 py-0.5 text-[10px] dark:bg-white/[0.04] bg-black/[0.03] dark:text-gray-500 text-gray-500 rounded-md font-mono">{{ versionsWithStatus.length }}</span>
            </div>

          <div class="flex flex-col">
            <div
              v-for="ver in versionsWithStatus"
              :key="`${ver.bucket}-${ver.manifestName}`"
              class="group border rounded-xl p-3 mb-2 flex justify-between items-center transition-all cursor-default"
              :class="isVersionSelected(ver)
                ? 'dark:bg-indigo-500/10 bg-indigo-50/80 dark:border-indigo-400/40 border-indigo-400/60 shadow-[inset_3px_0_0_rgba(99,102,241,0.72)]'
                : 'dark:bg-zinc-900/40 bg-white/70 dark:border-zinc-800/60 border-zinc-200/70 hover:dark:border-zinc-700 hover:border-zinc-300'"
              @click="selectVersion(ver)"
            >
              <!-- 左侧：版本号 + 微型 Bucket 标签 -->
              <div class="flex items-center min-w-0 flex-1">
                <span class="dark:text-zinc-100 text-zinc-900 font-semibold font-mono truncate">{{ ver.version }}</span>
                <span class="dark:bg-zinc-800 bg-zinc-100 dark:text-zinc-400 text-zinc-500 text-[10px] px-1.5 py-0.5 rounded ml-2 flex-shrink-0 font-mono leading-none">{{ ver.bucket }}</span>
              </div>

              <!-- 右侧：真实 Scoop 内部包名 + 操作 -->
              <div class="flex items-center gap-2 flex-shrink min-w-0 pl-3">
                <span class="dark:text-zinc-500 text-zinc-500 text-[12px] font-mono truncate min-w-[96px] max-w-[220px] sm:max-w-[260px]">{{ ver.manifestName }}</span>

                <template v-if="ver.isInstalled">
                  <NTag
                    size="small"
                    :bordered="false"
                    class="!h-6 !px-2 !bg-emerald-500/12 !text-emerald-400 !font-mono"
                  >
                    已安装
                  </NTag>
                  <NTag
                    v-if="isActiveVersion(ver)"
                    size="small"
                    :bordered="false"
                    class="!h-6 !px-2 !bg-cyan-500/12 !text-cyan-400 !font-mono"
                  >
                    活动
                  </NTag>
                  <NTooltip>
                    <template #trigger>
                      <NButton
                        type="primary"
                        secondary
                        size="tiny"
                        :loading="resettingSet.has(ver.manifestName)"
                        :disabled="resettingSet.has(ver.manifestName)"
                        class="!rounded-md opacity-75 hover:opacity-100 !transition-opacity cursor-pointer"
                        @click.stop="handleReset(ver)"
                      >
                        <template #icon><NIcon :component="RefreshOutline" size="13" /></template>
                        设为活动
                      </NButton>
                    </template>
                    将此版本设为系统的默认活动版本 (scoop reset)
                  </NTooltip>
                </template>
                <template v-else>
                  <NButton
                    secondary
                    size="tiny"
                    :loading="installingSet.has(getInstallName(ver))"
                    :disabled="installingSet.has(getInstallName(ver))"
                    class="!rounded-md opacity-70 hover:opacity-100 !transition-opacity cursor-pointer"
                    @click.stop="handleInstall(ver)"
                  >
                    <template #icon><NIcon :component="DownloadOutline" size="14" /></template>
                    安装
                  </NButton>
                </template>
                <NButton
                  text
                  size="tiny"
                  title="复制安装命令"
                  class="!text-zinc-600 hover:!text-cyan-400 opacity-60 hover:opacity-100 transition-opacity duration-150 cursor-pointer"
                  @click.stop="copyCmd(ver)"
                >
                  <template #icon>
                    <NIcon
                      :component="copiedVer === ver.version ? CheckmarkDoneOutline : CopyOutline"
                      :size="13"
                      :class="copiedVer === ver.version ? '!text-emerald-400' : ''"
                    />
                  </template>
                </NButton>
              </div>
            </div>
          </div>
          </template>
        </div>

        <div class="flex-shrink-0 px-5 py-3 border-t dark:border-white/[0.06] border-black/[0.06] flex gap-2">
          <NButton
            v-if="app.website"
            secondary
            size="small"
            class="flex-1 !rounded-md"
            @click="openWebsite(app.website)"
          >
            <template #icon><NIcon :component="GlobeOutline" size="14" /></template>
            官方网站
          </NButton>
          <NButton
            secondary
            size="small"
            class="flex-1 !rounded-md"
            @click="copyMainCmd"
            :disabled="!app || versionsWithStatus.length === 0"
          >
            <template #icon>
              <NIcon
                :component="CopyOutline"
                size="14"
              />
            </template>
            复制安装命令
          </NButton>
        </div>
      </div>

      <div v-else class="flex flex-col items-center justify-center h-full text-gray-500">
        <NIcon :component="CubeOutline" size="40" class="opacity-30 mb-3" />
        <p class="text-sm">未选择软件</p>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
