/**
 * 构建后脚本：从 release/ 目录解析 NSIS 安装包，生成 update.json
 *
 * 用法: node scripts/generate-update-json.mjs
 * 环境变量:
 *   RELEASE_NOTES  — 发布说明（可选）
 *
 * 输出: release/update.json
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'

const ROOT = process.cwd()
const RELEASE_DIR = join(ROOT, 'release')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'))
const version = pkg.version

const files = readdirSync(RELEASE_DIR)
const installer = files.find(f => /Setup.*\.exe$/i.test(f))

if (!installer) {
  console.error('❌ 在 release/ 中未找到 NSIS 安装包（匹配 *Setup*.exe）')
  process.exit(1)
}

const installerPath = join(RELEASE_DIR, installer)
const content = readFileSync(installerPath)
const stats = statSync(installerPath)
const sha512 = createHash('sha512').update(content).digest('base64')
// gh CLI replaces spaces with dots when uploading release assets
const githubAssetName = installer.replace(/ /g, '.')
const tagName = `v${version}`
const downloadUrl = `https://github.com/hyawara/scoop-ui/releases/download/${tagName}/${encodeURIComponent(githubAssetName)}`

const updateJson = {
  version,
  notes: process.env.RELEASE_NOTES || '',
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      url: downloadUrl,
      signature: sha512,
    },
  },
}

const outPath = join(RELEASE_DIR, 'update.json')
writeFileSync(outPath, JSON.stringify(updateJson, null, 2))

console.log(`✅ update.json 生成完毕 → ${outPath}`)
console.log(`   Version:   ${version}`)
console.log(`   Installer: ${installer} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`)
console.log(`   SHA512:    ${sha512.slice(0, 32)}...`)
console.log(`   URL:       ${downloadUrl}`)
