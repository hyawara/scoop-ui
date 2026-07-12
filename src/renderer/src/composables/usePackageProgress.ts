import { ref } from 'vue'

/**
 * 极简全局执行态：不再计算百分比、不再逐包散列进度。
 *
 * 只维护两盏灯：
 *   - isProcessing：是否有 Scoop 原生命令正在后台流动（驱动顶部 2px 呼吸条）
 *   - currentProcessingPackageName：当前正被 Scoop 接管的软件名（驱动列表行高亮随动）
 *
 * 成功 / 失败不再从日志正则解析，一律由命令结束后的 list/status 真实状态对齐。
 */

// 模块级单例：多次 usePackageProgress() 调用共享同一份响应式状态
const isProcessing = ref(false)
const currentProcessingPackageName = ref<string | null>(null)

export function usePackageProgress() {
  /** 开始一段批量/单包流程：亮起呼吸条 */
  function startProcessing(firstName?: string) {
    isProcessing.value = true
    currentProcessingPackageName.value = firstName ?? null
  }

  /**
   * 进程流中捕获到软件名关键字时切换激活行。
   * 仅通过日志中的 Installing/Updating 头部锚点提取包名，绝不解析百分比。
   */
  function setCurrent(name: string | null) {
    currentProcessingPackageName.value = name
  }

  /** 从一整块日志里嗅探当前正在处理的软件名（Installing '<name>' / Updating '<name>'） */
  function handleLog(message: string) {
    if (!isProcessing.value) return
    const m = /(?:Installing|Updating|Uninstalling)\s+'([^']+)'/i.exec(message)
    if (m) currentProcessingPackageName.value = m[1]
  }

  /** 全流程收尾：熄灭呼吸条 + 清除所有行高亮 */
  function finishProcessing() {
    isProcessing.value = false
    currentProcessingPackageName.value = null
  }

  /** 判断某行是否为当前激活行 */
  function isCurrent(name: string): boolean {
    return currentProcessingPackageName.value === name
  }

  return {
    isProcessing,
    currentProcessingPackageName,
    startProcessing,
    setCurrent,
    handleLog,
    finishProcessing,
    isCurrent,
  }
}
