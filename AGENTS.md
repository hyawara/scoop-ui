# Scoop UI — Agent Guide

## Project Structure

```
scoop-ui/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Window creation, Mica, IPC registration
│   │   ├── ipc/
│   │   │   ├── scoop.ts         # All Scoop command IPC handlers
│   │   │   └── config.ts        # Config read/write IPC (config:get / set / getAll)
│   │   └── utils/
│   │       ├── config.ts        # ~/.scoop-ui/config.json CRUD (dot-path access)
│   │       ├── config.default.json
│   │       └── powershell.ts    # spawn wrapper: -NoProfile -NonInteractive + iconv-lite GBK→UTF-8
│   ├── preload/
│   │   └── index.ts             # contextBridge → window.scoopAPI (35+ APIs)
│   └── renderer/                # Vue 3 app
│       └── src/
│           ├── App.vue          # NConfigProvider, theme overrides, state provides
│           ├── main.ts
│           ├── components/      # ~18 components: Header, Dashboard, SettingsPanel, etc.
│           ├── stores/          # Pinia: app.ts, packages.ts, settings.ts
│           ├── composables/     # usePackageProgress.ts
│           └── types/index.ts
├── scripts/
│   ├── build-icons.cjs          # SVG → PNG + ICO (sharp + png-to-ico)
│   ├── copy-config.mjs          # Copy config.default.json → dist/
│   └── generate-update-json.mjs # Post-build: parse NSIS → update.json for auto-update
├── vite.config.ts               # root: src/renderer, outDir: dist/renderer, alias @/
├── tsconfig.json                # Renderer TS config
├── tsconfig.node.json           # Main + preload TS config (outDir: dist)
└── electron-builder.yml         # NSIS installer config (output: release/)
```

## Dev Commands

| Command | What it does |
|---|---|
| `pnpm run dev` | Vite dev server (port 5173) |
| `pnpm vue-tsc --noEmit` | Full TS type check |
| `pnpm run build:icons` | Generate PNG/ICO from SVG |
| `pnpm run build:main` | `tsc -p tsconfig.node.json` + `copy-config.mjs` |
| `pnpm run build:renderer` | `vite build` → `dist/renderer` |
| `pnpm run build` | All three: icons → main → renderer |
| `pnpm run electron:dev` | Build + run electron . |
| `pnpm run electron:build` | Build + electron-builder + generate-update-json |

Quick type-check: `pnpm vue-tsc --noEmit`

## Build & Release Pipeline

Full release (for CI / tag push):

```bash
pnpm run build:icons            # 1. Generate app icons (PNG + ICO + dist/icons/)
pnpm run build:main             # 2. Compile main/preload TS + copy config template
pnpm run build:renderer         # 3. Build Vue/Vite renderer
pnpm electron-builder           # 4. Package NSIS + Zip → release/
node scripts/generate-update-json.mjs  # 5. Generate update.json
```

Or one-liner: `pnpm run electron:build` (chains build → electron-builder → update.json)

Output:
- `release/Scoop UI Setup X.Y.Z.exe` — NSIS installer
- `release/Scoop UI-X.Y.Z-win.zip` — portable zip for overlay upgrade
- `release/update.json` — auto-update metadata

## Key Architecture

- **IPC bridge**: `renderer` → `window.scoopAPI.xxx()` → `preload/index.ts` (contextBridge) → `ipcMain.handle` in `src/main/index.ts`
- **Config persistence**: `theme.fontFamily` stored as CSS font-family string in `~/.scoop-ui/config.json`
- **Font system**: `App.vue` provides `fontList` (string[]) and `fontFamily` (CSS string). Watch on `fontList` auto-syncs to `fontFamily` + persists via IPC. SettingsPanel modifies `fontList` directly.
- **No drag library**: Font reorder uses native HTML5 Drag & Drop API
- **Theme**: Naive UI `NConfigProvider` + `themeOverrides` computed (dark/light, 5 color presets, fontFamily)
- **No CSS framework aside from Tailwind** — component-level styles use scoped `<style>`

## Gotchas

- TypeScript 6.x strict mode — `null` not assignable to `string` types without explicit handling
- Electron `frame: false` + Mica require `titleBarStyle: 'hidden'` and `setBackgroundMaterial('mica')`
- PowerShell must run with `-NoProfile -NonInteractive` and `iconv-lite` decode stream for CJK chars
- `build:main` runs `tsc -p tsconfig.node.json` (node config) — separate from renderer tsconfig
- Some pre-existing type errors in `BucketDrawer.vue` and `StorageEnvCard.vue` — avoid touch unless fixing
