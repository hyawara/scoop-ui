import { readdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const UNUSED_DLLS = [
  'd3dcompiler_47.dll',
  'dxcompiler.dll',
  'dxil.dll',
  'libEGL.dll',
  'libGLESv2.dll',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
  'ffmpeg.dll',
]

const KEEP_LOCALES = ['en-US.pak', 'zh-CN.pak', 'resources.pak', 'chrome_100_percent.pak', 'chrome_200_percent.pak']

const root = process.argv[2] || 'release/win-unpacked'

// 1. Remove unused DLLs
for (const dll of UNUSED_DLLS) {
  const p = join(root, dll)
  if (existsSync(p)) {
    rmSync(p, { force: true })
    console.log(`  removed: ${dll}`)
  }
}

// 2. Remove unused locales
const localesDir = join(root, 'locales')
if (existsSync(localesDir)) {
  for (const f of readdirSync(localesDir)) {
    if (!KEEP_LOCALES.includes(f)) {
      rmSync(join(localesDir, f), { force: true })
    }
  }
  console.log('  cleaned: locales (kept en-US, zh-CN)')
}

// 3. Remove Chromium license HTML
const licenseFile = join(root, 'LICENSES.chromium.html')
if (existsSync(licenseFile)) {
  rmSync(licenseFile, { force: true })
  console.log('  removed: LICENSES.chromium.html')
}

console.log('cleanup done.')
