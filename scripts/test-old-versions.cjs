/**
 * 旧版本计算测试脚本 — 独立 Node.js 运行，不依赖 Electron
 * 用法: pnpm run test:old-versions
 *       或: node scripts/test-old-versions.cjs
 *
 * 逐 app 列出：
 *   1. current junction 指向哪个版本
 *   2. app 下的所有版本目录
 *   3. 哪些被「错误计为旧版本」、各自大小
 *   4. 汇总总计
 *
 * ⚠️ 纯只读，不做任何删除操作
 */
const { existsSync, readlinkSync, readdirSync, statSync } = require('fs')
const { join, basename } = require('path')
const { homedir } = require('os')
const { execSync } = require('child_process')

// ── 工具函数 ──

function getDirSize(dirPath) {
  let total = 0
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          total += getDirSize(fullPath)
        } else if (entry.isFile()) {
          total += statSync(fullPath).size
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i]
}

// ── 解析 Scoop 根目录 ──

function resolveScoopRoot() {
  const envRoot = (process.env['SCOOP'] || '').trim()
  if (envRoot) return envRoot
  try {
    const stdout = execSync('scoop config root_path', { encoding: 'utf8', timeout: 5000 })
    let p = stdout.trim()
    if (p) {
      if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
        p = join(homedir(), p.slice(1))
      }
      return p
    }
  } catch { /* 读取失败 */ }
  return join(homedir(), 'scoop')
}

// ── 主逻辑 ──

function main() {
  const scoopRoot = resolveScoopRoot()
  console.log(`Scoop Root: ${scoopRoot}`)

  const appsDir = join(scoopRoot, 'apps')
  if (!existsSync(appsDir)) {
    console.log('❌ apps 目录不存在:', appsDir)
    process.exit(1)
  }

  const apps = readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  console.log(`\n找到 ${apps.length} 个 app 目录\n`)
  console.log('='.repeat(80))

  let grandTotal = 0
  let oldAppCount = 0
  let skippedCurrentCount = 0
  const details = []

  for (const app of apps) {
    const appDir = join(appsDir, app.name)
    const currentPath = join(appDir, 'current')

    // 1. 读取 current junction 的目标版本名
    let currentVersionName = ''
    let readlinkOk = false
    try {
      currentVersionName = basename(readlinkSync(currentPath))
      readlinkOk = true
    } catch {
      readlinkOk = false
    }

    // 2. 列出所有版本目录
    const allDirs = readdirSync(appDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== 'current')

    if (allDirs.length === 0) continue

    // 3. 分类：current 版本 vs 旧版本
    const currentDirs = []
    const oldDirs = []

    for (const dir of allDirs) {
      const isCurrent = currentVersionName && dir.name.toLowerCase() === currentVersionName.toLowerCase()
      const size = getDirSize(join(appDir, dir.name))

      if (isCurrent) {
        currentDirs.push({ name: dir.name, size })
      } else if (!readlinkOk) {
        // junction 破损时保守处理：不计为旧版本，防止误删
        currentDirs.push({ name: dir.name, size, conservative: true })
      } else if (currentVersionName) {
        oldDirs.push({ name: dir.name, size })
        grandTotal += size
      }
    }

    const hasOld = oldDirs.length > 0
    if (hasOld) oldAppCount++

    details.push({ app: app.name, currentVersionName, readlinkOk, currentDirs, oldDirs })

    // 输出此 app 的信息
    console.log(`\n📦 ${app.name}`)
    console.log(`   current junction → ${readlinkOk ? `✅ ${currentVersionName}` : '❌ 解析失败（非 junction 或不存在）'}`)
    console.log(`   目录总数: ${allDirs.length}  |  current: ${currentDirs.length}  |  旧版本: ${oldDirs.length}`)

    for (const cd of currentDirs) {
      const label = cd.conservative ? '[SAFE]' : '[CURRENT]'
      const note = cd.conservative ? '  ← junction 破损，保守跳过不计' : '  ← 跳过不计'
      console.log(`   ├─ ${label.padEnd(10)} ${cd.name.padEnd(14)} ${formatBytes(cd.size).padStart(12)}${note}`)
      skippedCurrentCount++
    }
    for (const od of oldDirs) {
      const flag = od.size > 0 ? '📌' : '  '
      console.log(`   ├─ [OLD]   ${flag} ${od.name.padEnd(14)} ${formatBytes(od.size).padStart(12)}`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log(`\n📊 汇总:`)
  console.log(`   有旧版本的 app 数: ${oldAppCount}`)
  console.log(`   成功排除 current 版本: ${skippedCurrentCount} 个`)
  console.log(`   🔍 readlinkSync 失败的 app 数: ${details.filter(d => !d.readlinkOk).length}`)
  console.log(`   📦 旧版本总计: ${formatBytes(grandTotal)}`)

  // 如果有 readlinkSync 失败的 app 且它们有目录 → 会被误算为旧版本
  const failedApps = details.filter(d => !d.readlinkOk && d.oldDirs.length + d.currentDirs.length > 0)
  if (failedApps.length > 0) {
    console.log(`\n⚠️ 以下 app 的 current junction 解析失败，导致所有版本目录都被计为旧版本:`)
    for (const fa of failedApps) {
      const all = [...fa.currentDirs, ...fa.oldDirs]
      console.log(`   - ${fa.app}: ${all.map(d => d.name).join(', ')} (共 ${formatBytes(all.reduce((s, d) => s + d.size, 0))})`)
    }
  }

  if (grandTotal === 0) {
    console.log('\n✅ 没有旧版本残留，计算正确！')
  } else {
    console.log(`\n⚠️ 旧版本总计 ${formatBytes(grandTotal)}，如果刚执行过 cleanup 仍不为 0，请确认:`)
    console.log('   1. 是否有 app 的 current junction 解析失败（见上方列表）')
    console.log('   2. scoop cleanup --all 是否未完全清理（可手动跑一次：scoop cleanup --all）')
  }

  // 额外安全检查：确认 cleanup 不会误删 current 版本
  console.log('\n🛡️ 安全提示: scoop cleanup --all 是 Scoop 官方命令，只清理旧版本，不会删除 current 指向的版本。')
  console.log('   本脚本纯只读，不做任何删除操作。')
}

main()
