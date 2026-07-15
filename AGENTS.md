# Scoop UI — Agent 指南

## 项目结构

```
scoop-ui/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 窗口创建、Mica、IPC 注册
│   │   ├── ipc/
│   │   │   ├── scoop.ts         # 全部 Scoop 命令的 IPC 处理器
│   │   │   ├── config.ts        # 配置读写 IPC（config:get / set / getAll）
│   │   │   └── updater.ts       # electron-updater：自动更新 + IPC（checkForUpdate / downloadUpdate / quitAndInstall）
│   │   └── utils/
│   │       ├── config.ts        # ~/.scoop-ui/config.json 增删改查（点路径访问）
│   │       ├── config.default.json
│   │       └── powershell.ts    # spawn 封装：-NoProfile -NonInteractive + iconv-lite GBK→UTF-8
│   ├── preload/
│   │   └── index.ts             # contextBridge → window.scoopAPI（35+ 个 API）
│   └── renderer/                # Vue 3 应用
│       └── src/
│           ├── App.vue          # NConfigProvider、主题覆盖、状态提供、更新状态机
│           ├── main.ts
│           ├── components/      # 约 18 个组件：Header、Dashboard、SettingsPanel、UpdateManager 等
│           ├── stores/          # Pinia：app.ts、packages.ts、settings.ts
│           ├── composables/     # usePackageProgress.ts
│           └── types/index.ts
├── scripts/
│   ├── build-icons.cjs          # SVG → PNG + ICO（sharp + png-to-ico）
│   └── copy-config.mjs          # 复制 config.default.json → dist/
├── vite.config.ts               # root: src/renderer，outDir: dist/renderer，别名 @/
├── tsconfig.json                # 渲染进程 TS 配置
├── tsconfig.node.json           # 主进程 + 预加载 TS 配置（outDir: dist）
└── electron-builder.yml         # NSIS 安装包配置（输出：release/）
```

## 开发命令

| 命令 | 作用 |
|---|---|
| `pnpm run dev` | 启动 Vite 开发服务器（端口 5173） |
| `pnpm vue-tsc --noEmit` | 全量 TypeScript 类型检查 |
| `pnpm run build:icons` | 从 SVG 生成 PNG/ICO |
| `pnpm run build:main` | `tsc -p tsconfig.node.json` + `copy-config.mjs` |
| `pnpm run build:renderer` | `vite build` → `dist/renderer` |
| `pnpm run build` | 三步合一：icons → main → renderer |
| `pnpm run electron:dev` | 构建并运行 electron . |
| `pnpm run electron:build` | 构建 + electron-builder（publish never）—— 仅本地打包 |
| `pnpm run release` | 构建 + electron-builder（publish always）—— 本地完整发布 |

快速类型检查：`pnpm vue-tsc --noEmit`

## 构建与发布流程

```bash
pnpm run build:icons            # 1. 生成应用图标（PNG + ICO + dist/icons/）
pnpm run build:main             # 2. 编译主进程/预加载 TS + 复制配置模板
pnpm run build:renderer         # 3. 构建 Vue/Vite 渲染进程
```

快速本地打包：`pnpm run electron:build`（构建 → electron-builder --publish never → 清理）

### CI / GitHub Actions

发布由 `.github/workflows/release.yml` 自动完成。推送一个匹配 `*.*.*` 的 tag（例如 `1.4.5`，**必须以数字开头，禁止 `v` 前缀**）会触发：

```
pnpm install → pnpm run build → electron-builder --win --x64 --publish always
```

> ⚠️ **Tag 命名铁律**：版本号必须严格使用 `X.Y.Z` 三段式（如 `1.4.5`），**禁止在前面加 `v` 前缀**（如 `v1.4.5` 为错误写法）。`release.yml` 的触发条件为 `tags: ['[0-9]*']`，带 `v` 的 tag 无法匹配，会导致 CI 不触发、Release 不生成。

electron-builder 从 `electron-builder.yml` 读取 `publish: github` 并自动：
- 为该 tag 创建 GitHub Release
- 上传：`*.exe` 安装包、`*.blockmap`（差分块）、`latest.yml`（更新清单）

### 如何发布

1. 在 `package.json` 中提升 `version` 版本号
2. 提交代码并推送到远程
3. 打 tag（严格 `X.Y.Z`，**禁止 `v` 前缀**）：`git tag 1.4.5`
4. 推送 tag（遵循下方「Git 提交流程」的代理规则）：`git push origin 1.4.5`
5. **监控 CI 结果**：运行 `gh run watch` 实时跟踪 workflow 直至完成，随后用 `gh release list` 确认 Release 版本号确为 `1.4.5`（既非 `v1.4.5`，亦不可缺失）
6. 用户的应用在下次启动时通过 `latest.yml` 检测到更新，仅下载变更块（差分），随后提示「重启并安装」

### 更新架构

```
app launch → autoUpdater.checkForUpdates()
    → 从 GitHub Release 读取 latest.yml
    → 若有新版本：向渲染进程发送 'available' 事件
    → 用户点击「立即更新」→ autoUpdater.downloadUpdate()
    → 经由 .blockmap 差分下载（仅下载变更字节）
    → 发送 'downloaded' 事件 → 用户点击「重启并安装」
    → quitAndInstall() → 退出 → NSIS 静默安装 → 重新启动
```

每个 Release tag 上的关键文件：
- `latest.yml` — 版本号、sha512、发布日期（electron-updater 读取此文件）
- `*.blockmap` — 用于差分下载的块级哈希
- `Scoop UI Setup X.Y.Z.exe` — NSIS 安装包

## 核心架构

- **IPC 桥接**：`renderer` → `window.scoopAPI.xxx()` → `preload/index.ts`（contextBridge）→ `src/main/index.ts` 中的 `ipcMain.handle`
- **配置持久化**：`theme.fontFamily` 以 CSS font-family 字符串形式存储在 `~/.scoop-ui/config.json`
- **字体系统**：`App.vue` 提供 `fontList`（string[]）与 `fontFamily`（CSS 字符串）。对 `fontList` 的 watch 会自动同步到 `fontFamily` 并通过 IPC 持久化。SettingsPanel 直接修改 `fontList`。
- **无拖拽库**：字体排序使用原生 HTML5 拖放 API
- **主题**：Naive UI 的 `NConfigProvider` + 计算属性 `themeOverrides`（深色/浅色、5 套配色预设、fontFamily）
- **除 Tailwind 外无其他 CSS 框架** —— 组件级样式使用 scoped `<style>`

## 注意事项

- TypeScript 6.x 严格模式 —— 未经显式处理，`null` 不能赋值给 `string` 类型
- Electron 的 `frame: false` + Mica 需要 `titleBarStyle: 'hidden'` 与 `setBackgroundMaterial('mica')`
- PowerShell 必须以 `-NoProfile -NonInteractive` 运行，并使用 `iconv-lite` 解码流以正确处理 CJK 字符
- `build:main` 运行 `tsc -p tsconfig.node.json`（node 配置）—— 与渲染进程 tsconfig 相互独立
- `BucketDrawer.vue` 与 `StorageEnvCard.vue` 中存在一些既有的类型错误 —— 除非修复，否则不要触碰

## Git 提交流程

- **提交信息**：使用中文撰写 commit message，清晰、简洁地描述本次改动（如 `feat: 新增xxx`、`fix: 修复xxx`，但描述文字须为中文）。
- **推送远程**：
  1. 先走代理推送（假设本地代理监听 `127.0.0.1:7890`）：
     ```bash
     git -c http.proxy=http://127.0.0.1:7890 -c https.proxy=http://127.0.0.1:7890 push origin <分支或tag>
     ```
  2. 若提示网络不通 / 连接超时，则去掉代理重试：
     ```bash
     git push origin <分支或tag>
     ```
  > 说明：代理仅对当次命令生效（使用 `-c` 临时参数），不会污染全局 git 配置。
