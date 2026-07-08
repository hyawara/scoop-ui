# Scoop UI — Agent Guide

## Project Structure

```
scoop-ui/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Window creation, Mica, IPC registration
│   │   ├── ipc/
│   │   │   ├── scoop.ts         # All Scoop command IPC handlers
│   │   │   ├── config.ts        # Config read/write IPC (config:get / set / getAll)
│   │   │   └── updater.ts       # electron-updater: autoUpdate + IPC (checkForUpdate / downloadUpdate / quitAndInstall)
│   │   └── utils/
│   │       ├── config.ts        # ~/.scoop-ui/config.json CRUD (dot-path access)
│   │       ├── config.default.json
│   │       └── powershell.ts    # spawn wrapper: -NoProfile -NonInteractive + iconv-lite GBK→UTF-8
│   ├── preload/
│   │   └── index.ts             # contextBridge → window.scoopAPI (35+ APIs)
│   └── renderer/                # Vue 3 app
│       └── src/
│           ├── App.vue          # NConfigProvider, theme overrides, state provides, update state machine
│           ├── main.ts
│           ├── components/      # ~18 components: Header, Dashboard, SettingsPanel, UpdateManager, etc.
│           ├── stores/          # Pinia: app.ts, packages.ts, settings.ts
│           ├── composables/     # usePackageProgress.ts
│           └── types/index.ts
├── scripts/
│   ├── build-icons.cjs          # SVG → PNG + ICO (sharp + png-to-ico)
│   └── copy-config.mjs          # Copy config.default.json → dist/
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
| `pnpm run electron:build` | Build + electron-builder (publish never) — local packaging only |
| `pnpm run release` | Build + electron-builder (publish always) — local full release |

Quick type-check: `pnpm vue-tsc --noEmit`

## Build & Release Pipeline

```bash
pnpm run build:icons            # 1. Generate app icons (PNG + ICO + dist/icons/)
pnpm run build:main             # 2. Compile main/preload TS + copy config template
pnpm run build:renderer         # 3. Build Vue/Vite renderer
```

Quick local packaging: `pnpm run electron:build` (build → electron-builder --publish never → cleanup)

### CI / GitHub Actions

Release is automated via `.github/workflows/release.yml`. Pushing a `v*` tag triggers:

```
pnpm install → pnpm run build → electron-builder --win --x64 --publish always
```

electron-builder reads `publish: github` from `electron-builder.yml` and automatically:
- Creates a GitHub Release for the tag
- Uploads: `*.exe` installer, `*.blockmap` (differential blocks), `latest.yml` (update manifest)

### How to release

1. Bump `version` in `package.json`
2. Commit and push
3. Tag: `git tag 1.2.0`
4. Push tag: `git push origin v1.2.0`
5. GitHub Actions builds and publishes the Release automatically
6. Users' apps detect the update on next launch via `latest.yml`, download only changed blocks (differential), then prompt "restart and install"

### Update architecture

```
app launch → autoUpdater.checkForUpdates()
    → reads latest.yml from GitHub Release
    → if newer: sends 'available' event to renderer
    → user clicks "立即更新" → autoUpdater.downloadUpdate()
    → differential download via .blockmap (only changed bytes)
    → sends 'downloaded' event → user clicks "重启并安装"
    → quitAndInstall() → exits → NSIS silent install → relaunch
```

Key files on each Release tag:
- `latest.yml` — version, sha512, release date (electron-updater reads this)
- `*.blockmap` — block-level hashes for differential download
- `Scoop UI Setup X.Y.Z.exe` — NSIS installer

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
