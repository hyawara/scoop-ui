<script setup lang="ts">
import { NButton, NProgress, NCard } from 'naive-ui'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

async function startInstall() {
  await appStore.installScoop()
}
</script>

<template>
  <div class="flex-1 flex items-center justify-center p-8">
    <NCard class="max-w-lg w-full text-center" :bordered="false">
      <div class="py-8">
        <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
          <span class="text-white text-3xl font-bold">S</span>
        </div>

        <h1 class="text-2xl font-bold mb-2">欢迎使用 Scoop UI</h1>
        <p class="text-gray-500 dark:text-gray-400 mb-8">
          检测到系统尚未安装 Scoop 包管理器。Scoop 是 Windows 上最强大的命令行包管理器，让软件安装变得简单高效。
        </p>

        <div class="flex flex-col gap-3 mb-6">
          <div class="flex items-center gap-3 text-left text-sm text-gray-500 dark:text-gray-400">
            <span class="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 text-green-600 flex items-center justify-center text-xs">&#10003;</span>
            无需管理员权限，安装到用户目录
          </div>
          <div class="flex items-center gap-3 text-left text-sm text-gray-500 dark:text-gray-400">
            <span class="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 text-green-600 flex items-center justify-center text-xs">&#10003;</span>
            干净的安装卸载，不残留注册表
          </div>
          <div class="flex items-center gap-3 text-left text-sm text-gray-500 dark:text-gray-400">
            <span class="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900 text-green-600 flex items-center justify-center text-xs">&#10003;</span>
            海量开源软件，一键安装
          </div>
        </div>

        <div v-if="appStore.loading" class="mb-4">
          <NProgress
            type="line"
            :percentage="50"
            :indicator-placement="'inside'"
            processing
          />
          <p class="text-xs text-gray-400 mt-2">{{ appStore.progress?.message || '正在安装 Scoop...' }}</p>
        </div>

        <NButton
          type="primary"
          size="large"
          :loading="appStore.loading"
          @click="startInstall"
          class="!px-8"
        >
          一键安装 Scoop
        </NButton>
      </div>
    </NCard>
  </div>
</template>
