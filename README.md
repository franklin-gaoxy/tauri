# Markdown 编辑器

一个高度仿照 [Typora](https://typora.io/) 的所见即所得 Markdown 桌面编辑器：菜单栏、文件树 / 大纲侧边栏、整页偏好设置、实时渲染的正文与状态栏，都按 Typora 的布局与交互习惯实现。

- **开源免费**：MIT 协议，个人与商业用途均可免费使用，无订阅、无功能锁、无广告
- **绿色版**：提供免安装绿色版，解压即可运行，适合没有管理员权限或安装软件受限的电脑
- **完全绿色版**：另提供内置 WebView2 运行时的版本，电脑没装运行时、不能联网也能直接用
- **轻量**：Tauri 2 + 系统 WebView2，安装包体积小、启动快，内存占用远低于 Electron 方案

> 说明：本项目是独立实现，仅参考了 Typora 的交互习惯与排版风格，没有使用其代码、图标、字体或界面素材，与 Typora 官方无任何关联；"Typora" 是其权利人的商标。

## 功能

**编辑与渲染**

- 所见即所得：标题、粗体 / 斜体 / 删除线 / 高亮 / 行内代码、引用、列表、任务列表、分割线、链接、图片
- 表格：光标不在表内时渲染为带表头与对齐方式的真表格，点一下即回到 Markdown 源码编辑
- 数学公式：`$...$` 行内公式、`$$...$$` 公式块（KaTeX）
- 图表：```` ```mermaid ```` 围栏渲染流程图、时序图等
- 代码块：语法高亮，语言包按需动态加载，可在设置中勾选启用的语言
- 图片：相对路径按当前文档目录解析，本地图片直接显示

**界面**

- 菜单栏：文件 / 编辑 / 段落 / 格式 / 视图 / 主题 / 帮助，含快捷键提示、勾选状态与子菜单
- 侧边栏：文件树（搜索、新建、展开折叠、当前文件高亮）与大纲（按层级缩进、点击跳转、跟随光标）
- 偏好设置：整页式布局，左侧分类（文件 / 编辑器 / 图像 / Markdown / 导出 / 外观 / 通用）
- 状态栏：源码模式开关、字数统计
- 主题：浅色 / 深色，可调字体、字号、行距、版心宽度

**写作辅助**

- 专注模式（淡出非当前段落）、打字机模式（光标锁定屏幕中部）
- 源码模式切换、缩放（跟随字体倍率，不破坏光标定位）
- 自动保存、外部修改检测与同步、最近打开的目录记忆

## 运行要求

| 项 | 要求 |
| --- | --- |
| 操作系统 | Windows 10 / 11，64 位（ARM64 需自行编译对应版本） |
| 运行时 | **Microsoft Edge WebView2 Runtime**（Win11 内置；Win10 多数已随 Edge 预装） |
| 安装权限 | 绿色版不需要；安装包版需要 |
| 其他 | 无需 Node.js / Rust / .NET / VC++ 运行库 |

**如果电脑上没有 WebView2**（精简版系统、LTSC、早期 Win10、或公司镜像删除过），普通绿色版会启动失败。这时请下载 **完全绿色版**：它已内置固定版本 WebView2 运行时，解压即用、不需要联网、不需要安装任何东西。

判断方法：打开 `设置 → 应用 → 已安装的应用`，搜索 `WebView2`；或直接先试普通绿色版，若双击后没有窗口再换完全绿色版。

## 绿色版（免安装）

两种包都是压缩包，解压到任意目录，双击 `MarkdownEditor.exe` 即可运行，不写注册表、不需要安装程序、不需要管理员权限，可以放 U 盘随身携带。

| 包 | 体积 | 适用场景 |
| --- | --- | --- |
| `MarkdownEditor-win64-portable.zip` | 约 4 MB | 系统已有 WebView2（绝大多数 Win11 / Win10） |
| `MarkdownEditor-win64-full.zip` | 约 250 MB | **完全绿色版**：内置 WebView2 固定版本（133.0.3065.92），离线可用，适合没有运行时或不能联网的电脑 |

- 普通版包含 `MarkdownEditor.exe`、使用说明、`LICENSE`、第三方许可声明
- 完全版额外带一个 `Microsoft.WebView2.FixedVersionRuntime.*` 目录，**必须与 exe 同级**，不能只拷 exe；首次运行会对该目录做一次权限设置（`icacls` 授予 AppContainer 读取权限，Win10 需要，无需管理员），因此首启会慢 1–2 秒
- 两者都支持 Windows 10 / 11 64 位；完全版不支持从网络共享（UNC 路径）直接运行

发布版请在仓库的 [Releases](https://github.com/franklin-gaoxy/tauri/releases) 下载；也可以自行打包（见下文）。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面容器 | [Tauri 2](https://tauri.app/)（Rust 负责文件系统、窗口、监听等系统能力） |
| 编辑器内核 | [CodeMirror 6](https://codemirror.net/) |
| 渲染 | 自研实时预览装饰（`src/editor/livepreview.ts`）、KaTeX、Mermaid |
| 前端 | Vite + TypeScript（原生 DOM，无框架、无 UI 组件库） |
| 包管理 | pnpm |

## 本地开发

环境要求：Node.js 20+、pnpm、Rust（stable）、Windows 需 WebView2。

```bash
pnpm install
pnpm tauri dev      # 开发模式，热更新
pnpm tauri build    # 正式构建，输出安装包到 src-tauri/target/release/bundle
```

### 打包绿色版

```bash
pnpm tauri build --no-bundle
```

产物为单个可执行文件：`src-tauri/target/release/tauri-app.exe`。把它改名为 `MarkdownEditor.exe`，连同说明文件一起压缩成 zip 即为绿色版。

### 打包完全绿色版（内置 WebView2）

1. 从微软 WebView2 下载页获取 **Fixed Version** 的 x64 cab 包（体积约 250 MB）
2. 解压到程序目录，保持目录名以 `Microsoft.WebView2.FixedVersionRuntime` 开头：

   ```powershell
   expand .\Microsoft.WebView2.FixedVersionRuntime.133.0.3065.92.x64.cab -F:* .\pack\
   ```

3. 把 `MarkdownEditor.exe` 放到与 `Microsoft.WebView2.FixedVersionRuntime.*` 同级的目录，一起压缩

程序启动时会自动查找同级目录下以 `Microsoft.WebView2.FixedVersionRuntime` 开头的文件夹，设置 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` 交给 WebView2 加载器，并在首次运行时为 Windows 10 的 AppContainer 授予读取权限（实现见 `src-tauri/src/lib.rs`）。目录不存在时自动回退到系统安装的 WebView2，因此同一个 exe 两种包都能用。

## 目录结构

```
src/
  editor/        编辑器内核：实时预览、代码高亮、语言按需加载、格式命令、模式（专注/打字机）
  lib/ipc.ts     唯一的 IPC 出口，页面不直接调用 invoke
  settings/      外观主题与偏好配置的持久化
  ui/            菜单栏、侧边栏、偏好设置、对话框
  main.ts        装配与业务流程
src-tauri/
  src/commands/  按领域拆分的 Tauri 命令（文件系统、监听）
  src/lib.rs     仅做 Builder 装配
```

## 用 AI 改这个项目

仓库根目录提供 [AI.md](./AI.md)：一份面向 AI 助手的开发指南，包含代码地图（文件 → 职责 → 关键函数）、数据流、渲染模型（行内装饰 vs 块级 StateField）、常见改动配方（加命令 / 加菜单 / 加格式命令 / 加设置项 / 加语言）以及已知坑。

配合 [AGENTS.md](./AGENTS.md) 的编码规则使用后，AI 通常只需要读 2–4 个相关文件就能动手，不必全量通读源码，能明显降低 token 消耗、减少误改。

```text
请先读 AI.md 和 AGENTS.md，然后实现：<你的需求>
```

## 参与贡献

欢迎提交 Issue 与 Pull Request。提交前请确保 `pnpm tauri dev` 可正常启动，并保持现有代码风格与目录约定。

## 许可证

[MIT](./LICENSE) © franklin-gaoxy

你可以自由使用、修改、分发本软件，包括用于商业项目，只需保留版权声明与许可声明。

程序使用的第三方组件（CodeMirror、KaTeX、Mermaid、Tauri 等）均为 MIT / Apache-2.0 / ISC / BSD / MPL-2.0 / EPL-2.0 等宽松或弱著佐权许可，不含 GPL / AGPL，允许商业使用且不要求公开本项目源码。完整清单与署名见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。
