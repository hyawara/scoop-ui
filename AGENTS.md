# 角色与核心任务
你是一个资深的桌面端全栈开发专家，精通 Electron、Vue 3、Vite、TypeScript 以及 Naive UI。
现在请你帮我搭建一个专注于 Windows 平台下 Scoop 包管理器的现代化 GUI 工具。

系统要求：
- 前端技术栈：Vue 3 (Setup 语法糖) + Vite + TypeScript + Tailwind CSS
- UI 组件库：Naive UI (利用其强大的 NConfigProvider 自定义主题)
- 后端技术栈：Electron (Main 进程调用原生 PowerShell / CMD)

---

# 一、 功能与业务逻辑实现方案

你需要在代码中预留或实现以下核心业务逻辑：
1. 环境生命周期与一键引导 (Onboarding)：
   - 启动时自动检测系统是否已安装 Scoop（通过主进程执行 `where scoop` 或检查环境变量 `USERPROFILE\.scoop`）。
   - 若未安装，UI 平滑切换至“一键引导页”，调用主进程异步执行官方 PowerShell 安装脚本。
   - 优先引导用户通过 Scoop 安装 `git`，后续所有软件的安装、更新流程，均通过配置好的 git-bash/scoop 环境执行。
   - 路径管理：在主进程中支持自定义 `SCOOP` 和 `SCOOP_GLOBAL` 环境变量。设计迁移逻辑：当用户更改安装目录时，后台异步复制旧目录数据，并更新系统环境变量。

2. Scoop 原生命令异步对接：
   - 使用 Electron 主进程的 `child_process.spawn` 异步、非阻塞地执行原生命令：`search`, `install`, `uninstall`, `update`, `cleanup`, `cache`。
   - **关键防坑**：执行 PowerShell 时必须附加 `-NoProfile -NonInteractive` 参数。必须使用 `iconv-lite` 对 `stdout` 缓冲流进行 GBK 到 UTF-8 的编码转换，彻底避免 Windows 终端中文乱码。
   - 进度监听：通过 `stdout` 实时捕获安装进度（如下载百分比），通过 IPC (inter-process communication) 实时推送给 Vue 前端，渲染成进度条。

3. 全局代理配置：
   - 提供 HTTP/SOCKS5 代理输入框。开启后，后台执行 `scoop config proxy [地址]`，关闭时执行 `scoop config rm proxy`。

---

# 二、 视觉与 UI/UX 布局设计 (Bento Box / Fluent Design)

UI 必须抛弃传统的“左侧死板边栏 + 右侧大表格”的设计，采用 Windows 11 独有的 **Mica（云母/毛玻璃）** 质感，结合不对称的 **Bento Box（便当盒流式卡片）** 布局。

### 1. 顶部全局融合栏 (Header Component)
- **样式**：Electron 设置 `frame: false`（无边框窗口），顶部由 Vue 组件自定义实现。背景为半透明毛玻璃，支持鼠标拖拽窗口 (`-webkit-app-region: drag`)。
- **左侧**：应用 Logo 及极简的运行状态微型标签（例如：`Scoop: 正常` | `代理: 127.0.0.1:7890`）。
- **中间（视觉重心）**：一个宽大的、居中的**类 MacOS Spotlight 智能搜索框**（支持 `Ctrl + K` 快捷键聚焦）。当鼠标悬浮或聚焦时，搜索框四周有流光微特效（Glow Effect）。
- **右侧**：设置（齿轮）、全局刷新、以及自定义的最小化/最大化/关闭按钮 (`-webkit-app-region: no-drag`)。

### 2. 主体工作区双状态动态切换 (Main Workspace)

#### 状态 A：仪表盘模式 (Dashboard Mode - 搜索框为空时显示)
由 4 个不对称、带微阴影与圆角的 Naive UI 卡片 (`n-card`) 组成的流式便当盒布局：
- **卡片 1 (左侧大卡片 - 应用管理核心)**：
  - 使用 Naive UI 的 `n-tabs` 切换 [已安装]、[有可更新]、[软件发现]。
  - 列表项放弃表格，采用微型卡片流 (Micro-cards)。每个软件有大图标、版本 Tag，更新时卡片内嵌平滑的 `n-progress` 进度条。
- **卡片 2 (右上长卡片 - 系统清理与缓存)**：
  - 左侧为一个精致的圆形仪表盘 (`n-progress type="dashboard"`)，实时显示 Scoop 缓存文件占用的空间（MB）。
  - 右侧为一个醒目的“一键彻底清除缓存”按钮。点击后触发卡片内微动画。
- **卡片 3 (左下横卡片 - 存储与路径环境)**：
  - 炫酷显示当前 Scoop Root 和 Global 的盘符剩余空间。
  - 包含一个“迁移目录”按钮，点击弹窗引导更换路径。
- **卡片 4 (右下小卡片 - 网络与代理核心)**：
  - 聚合代理开关，支持一键切断或启用代理。

#### 状态 B：搜索/详情模式 (Search/Inspect Mode - 用户开始输入时平滑切换)
- **左侧半幅**：搜索结果流，鼠标悬浮高亮，并带有 [已安装] 或 [未安装] 的状态徽章。
- **右侧半幅（抽屉式或并排固定）**：选中软件的**沉浸式详情大面板**。
  - 顶部大字号显示软件名、图标、官方网站直达链接。
  - 中部展示软件的 Manifest 源码 JSON 视图、依赖项关系。
  - 底部提供高级安装开关（如 `--global` 独立安装、`--skip-check` 跳过哈希检查等）以及一个巨大的安装/卸载动作按钮。

---

# 三、 期望输出的代码文件结构

请为我生成并输出以下核心代码，使用 TypeScript 编写，逻辑清晰、模块化：

1. **项目目录结构树**：清晰展示 Electron 主进程、渲染进程、Vue 组件及通信文件的推荐布局。
2. **`src/main/index.ts` (Electron 主进程核心逻辑)**：
   - 包含无边框窗口初始化、Mica 效果配置。
   - 包含接收前端 IPC 请求并异步执行 PowerShell 命令（带 `iconv-lite` 乱码处理、`-NoProfile`、进程销毁、实时进度数据推送到前端）的完整函数封装。
3. **`src/renderer/src/App.vue` (主视图框架)**：
   - 引入 Naive UI 的 `n-config-provider`（配置 Windows 11 风格的暗色/亮色主题）。
   - 实现无边框 Header（包含拖拽区、Spotlight 搜索框、系统控制按钮）。
4. **`src/renderer/src/components/Dashboard.vue` (便当盒仪表盘组件)**：
   - 使用 Tailwind CSS 网格布局 (`grid grid-cols-12 gap-4`) 完美复刻上述 4 个便当盒卡片的外观，并绑定 Naive UI 的组件与 TypeScript 状态。

请开始生成。
