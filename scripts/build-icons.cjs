const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

// 图标专用 SVG（背景填满整个视口，无透明边角）
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#1e222b"/>
      <stop offset="100%" stop-color="#090a0f"/>
    </radialGradient>
    <linearGradient id="coreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="50%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="108" fill="url(#bgGrad)" stroke="#2a2e3d" stroke-width="6"/>
  <path d="M128 24v464M256 24v464M384 24v464M24 128h464M24 256h464M24 384h464" stroke="#ffffff" stroke-opacity="0.03" stroke-width="2"/>
  <g transform="translate(0, -10)">
    <path d="M256 110 L390 188 L390 344 L256 422 L122 344 L122 188 Z" fill="url(#coreGrad)" opacity="0.15" filter="url(#neonGlow)"/>
    <path d="M256 110 L390 188 L390 344 L256 422 L122 344 L122 188 Z" fill="none" stroke="url(#coreGrad)" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M256 110 L256 266 L390 344 M256 266 L122 344" fill="none" stroke="url(#coreGrad)" stroke-width="8" opacity="0.7" stroke-linejoin="round"/>
    <circle cx="256" cy="188" r="14" fill="#10b981" filter="url(#neonGlow)"/>
    <circle cx="188" cy="226" r="10" fill="#3b82f6"/>
    <circle cx="324" cy="226" r="10" fill="#6366f1"/>
    <path d="M160 366 Q256 410 352 366" fill="none" stroke="#10b981" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  </g>
</svg>`

async function convert() {
  const outDir = path.join(__dirname, '..', 'build', 'icons')
  const distDir = path.join(__dirname, '..', 'dist', 'icons')
  fs.mkdirSync(outDir, { recursive: true })
  fs.mkdirSync(distDir, { recursive: true })

  // 生成多尺寸 PNG
  const sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]
  const pngFiles = []

  for (const size of sizes) {
    const pngPath = path.join(outDir, `icon_${size}.png`)
    await sharp(Buffer.from(ICON_SVG))
      .resize(size, size)
      .png()
      .toFile(pngPath)
    console.log(`  icon: ${size}x${size}.png`)
    pngFiles.push(pngPath)
  }

  // 复制 256x256 作为 electron-builder 图标
  fs.copyFileSync(path.join(outDir, 'icon_256.png'), path.join(outDir, 'icon.png'))
  console.log('  icon: 256x256.png (for electron-builder)')

  // 使用 png-to-ico 生成多尺寸 ICO
  const pngToIco = require('png-to-ico').default
  const icoPngs = [16, 24, 32, 48, 64, 96, 128, 256].map(s =>
    path.join(outDir, `icon_${s}.png`)
  )
  const icoBuf = await pngToIco(icoPngs)
  fs.writeFileSync(path.join(outDir, 'icon.ico'), icoBuf)
  console.log(`  icon: icon.ico (${icoBuf.length} bytes, 8 sizes)`)

  // 复制到 dist/icons/
  for (const file of fs.readdirSync(outDir)) {
    fs.copyFileSync(path.join(outDir, file), path.join(distDir, file))
  }
  console.log('  → dist/icons/ 已同步')
}

convert().catch(err => {
  console.error('Icon generation failed:', err)
  process.exit(1)
})
