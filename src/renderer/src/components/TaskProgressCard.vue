<script setup lang="ts">
import { computed } from 'vue'
import { NIcon, NButton, NProgress } from 'naive-ui'
import { RefreshOutline, TerminalOutline } from '@vicons/ionicons5'

const props = defineProps<{
  isUpdating: boolean
  progress: number
  currentLine: string
  terminalLogs: string[]
}>()

const emit = defineEmits<{
  'show-logs': []
}>()

const lastLine = computed(() => {
  if (props.terminalLogs.length === 0) return ''
  return props.terminalLogs[props.terminalLogs.length - 1] || ''
})
</script>

<template>
  <Transition name="fade-slide">
    <div
      v-if="isUpdating"
      class="bg-[#181a21] border border-white/[0.06] rounded-xl p-4"
    >
      <!-- 头部行 -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
          <span class="text-xs font-medium text-white">正在更新系统软件...</span>
        </div>
        <NButton
          text
          size="tiny"
          @click="emit('show-logs')"
          class="!text-slate-400 hover:!text-slate-200 !rounded-md"
        >
          <template #icon><NIcon :component="TerminalOutline" size="12" /></template>
          查看原始日志
        </NButton>
      </div>

      <!-- 进度数值 + 进度条 -->
      <div class="flex items-center gap-3 mb-3">
        <span class="text-sm font-mono text-emerald-400 font-bold flex-shrink-0 w-10 text-right">
          {{ progress }}%
        </span>
        <NProgress
          type="line"
          :percentage="progress"
          :height="6"
          :border-radius="3"
          :show-indicator="false"
          status="success"
          :processing="true"
          class="flex-1"
        />
      </div>

      <!-- 底部当前行文本 -->
      <div
        v-if="lastLine"
        class="text-[10px] text-slate-500 font-mono truncate leading-tight"
        :title="lastLine"
      >
        {{ lastLine }}
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
