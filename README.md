# Markdown 编辑器

一个高度仿照 [Typora](https://typora.io/) 的所见即所得 Markdown 桌面编辑器：菜单栏、文件树 / 大纲侧边栏、整页偏好设置、实时渲染的正文与状态栏，都按 Typora 的布局与交互习惯实现。

- **开源免费**：MIT 协议，个人与商业用途均可免费使用，无订阅、无功能锁、无广告
- **绿色版**：提供免安装绿色版，解压即可运行，适合没有管理员权限或安装软件受限的电脑
- **轻量**：Tauri 2 + 系统 WebView2，安装包体积小、启动快，内存占用远低于 Electron 方案

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

## 绿色版（免安装）

绿色版是一个压缩包，解压到任意目录，双击其中的 `MarkdownEditor.exe` 即可运行，不写注册表、不需要安装程序、不需要管理员权限，可以放在 U 盘里随身携带。

- 适用于公司电脑禁止安装软件、无管理员权限、或不想在系统里留下安装痕迹的场景
- 运行依赖 Microsoft Edge WebView2 Runtime（Windows 10/11 系统已内置；老系统可装一次离线运行时）
- 需要把软件放到其他电脑时，直接复制整个解压后的文件夹即可

压缩包只有 `MarkdownEditor.exe` 和一份使用说明，约 4 MB。发布版请在仓库的 [Releases](https://github.com/franklin-gaoxy/tauri/releases) 下载（文件名形如 `MarkdownEditor-win64-portable.zip`）；也可以自行打包（见下文）。

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

## 参与贡献

欢迎提交 Issue 与 Pull Request。提交前请确保 `pnpm tauri dev` 可正常启动，并保持现有代码风格与目录约定。

## 许可证

[MIT](./LICENSE) © franklin-gaoxy

你可以自由使用、修改、分发本软件，包括用于商业项目，只需保留版权声明与许可声明。
