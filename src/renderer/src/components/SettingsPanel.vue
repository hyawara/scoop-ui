<script setup lang="ts">
import { ref, onMounted, inject } from 'vue'
import {
  NButton,
  NIcon,
  NModal,
  NTag,
  NDivider,
  NSpin,
  useMessage,
} from 'naive-ui'
import {
  InformationCircleOutline,
  OpenOutline,
  TerminalOutline,
  RefreshOutline,
} from '@vicons/ionicons5'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const message = useMessage()
const checkForUpdate = inject<() => Promise<void>>('checkForUpdate')
const updateInfo = inject<any>('updateInfo')

const APP_VERSION = '1.0.0'

const scoopVersion = ref('')
const scoopVersionLoading = ref(false)

onMounted(async () => {
  if (props.show) {
    await loadScoopVersion()
  }
})

async function loadScoopVersion() {
  scoopVersionLoading.value = true
  try {
    const result = await window.scoopAPI.getScoopVersion()
    scoopVersion.value = result.version || '未知'
  } catch {
    scoopVersion.value = '未检测到'
  } finally {
    scoopVersionLoading.value = false
  }
}

async function handleCheckUpdate() {
  if (checkForUpdate) {
    await checkForUpdate()
    if (updateInfo.value.hasUpdate) {
      message.success(`发现新版本 v${updateInfo.value.version}`)
    } else {
      message.info('当前已是最新版本')
    }
  }
}

function handleClose() {
  emit('update:show', false)
}
</script>

<template>
  <NModal
    :show="show"
    @update:show="handleClose"
    @after-enter="loadScoopVersion"
    preset="card"
    title="设置"
    style="width: 480px"
    :closable="true"
    :mask-closable="true"
    :close-on-esc="true"
  >
    <div class="flex flex-col gap-4">
      <!-- 版本信息分组 -->
      <div>
        <div class="flex items-center gap-2 mb-3">
          <InformationCircleOutline class="w-4 h-4 text-slate-400" />
          <span class="text-sm font-semibold text-white">版本信息</span>
        </div>

        <div class="flex flex-col gap-2">
          <!-- 当前软件版本 -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <span class="text-white text-xs font-bold">S</span>
              </div>
              <div>
                <span class="text-sm font-medium text-white">Scoop UI</span>
                <p class="text-xs text-slate-400">Scoop 包管理器图形界面</p>
              </div>
            </div>
            <NTag size="small" :bordered="false" class="!bg-white/[0.06] !text-slate-400 font-mono">
              v{{ APP_VERSION }}
            </NTag>
          </div>

          <!-- 底层 Scoop 版本 -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <NIcon :component="TerminalOutline" size="18" class="text-white" />
              </div>
              <div>
                <span class="text-sm font-medium text-white">Scoop Core</span>
                <p class="text-xs text-slate-400">底层包管理器引擎</p>
              </div>
            </div>
            <template v-if="scoopVersionLoading">
              <NSpin :size="14" />
            </template>
            <template v-else>
              <NTag size="small" :bordered="false" class="!bg-white/[0.06] !text-slate-400 font-mono">
                {{ scoopVersion }}
              </NTag>
            </template>
          </div>

          <!-- 检查更新 -->
          <div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div class="flex items-center gap-2">
              <RefreshOutline class="w-3.5 h-3.5 text-slate-400" />
              <span class="text-sm text-slate-300">检查更新</span>
            </div>
            <NButton
              size="small"
              secondary
              :loading="updateInfo?.checking"
              @click="handleCheckUpdate"
              class="!rounded-lg"
            >
              <template #icon><NIcon :component="RefreshOutline" size="14" /></template>
              检查更新
            </NButton>
          </div>
        </div>
      </div>

      <NDivider class="!my-0 !opacity-30" />

      <!-- 项目信息 -->
      <div class="flex items-center justify-between">
        <span class="text-xs text-slate-500">Scoop UI &copy; 2026</span>
        <NButton
          text
          size="tiny"
          tag="a"
          href="https://github.com/hyawara/scoop-ui"
          target="_blank"
          class="!text-slate-400 hover:!text-cyan-400"
        >
          <template #icon><NIcon :component="OpenOutline" size="12" /></template>
          GitHub
        </NButton>
      </div>
    </div>
  </NModal>
</template>
