import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const src = 'src/main/utils/config.default.json'
const dst = 'dist/main/utils/config.default.json'
const dir = dirname(dst)

if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
copyFileSync(src, dst)
console.log('✓ Copied config.default.json → dist/main/utils/')
