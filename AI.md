# AI.md — 面向 AI 助手的开发指南

接手本仓库时**先读这一份**，再按需打开少数文件，不必全量扫描源码。
硬性编码规则见 [AGENTS.md](./AGENTS.md)，本文只回答三个问题：代码在哪、怎么改、坑在哪。

## 0. 30 秒上手

```bash
pnpm install
pnpm build                                  # tsc + vite，先挡住类型错误
pnpm tauri dev                              # 必须能起窗口才算完成
pnpm tauri build --debug --no-bundle        # 出 exe：src-tauri/target/debug/tauri-app.exe
```

## 1. 技术栈与边界

- 桌面：**Tauri 2**（Rust 只做文件系统 / 窗口 / 监听，不写业务）
- 前端：**Vite + TypeScript + 原生 DOM**，无 React/Vue，无 UI 组件库，样式为原生 CSS 变量
- 编辑器：**CodeMirror 6**，实时预览由本项目自研（`src/editor/livepreview.ts`）
- 渲染扩展：KaTeX（公式）、Mermaid（图表），均按需动态加载

## 2. 代码地图（按阅读成本排序）

| 文件 | 行数 | 职责 / 关键导出 |
| --- | --- | --- |
| `src/styles.css` | ~1150 | 全部样式。改外观只动 CSS 变量与选择器 |
| `src/editor/livepreview.ts` | ~656 | 实时预览。`livePreview()`、`buildDecorations()`、`collectBlocks()`、`blockField`、各种 Widget |
| `src/main.ts` | ~493 | 装配与业务：打开/保存/树刷新/菜单定义/全局快捷键/模式切换 |
| `src/ui/preferences.ts` | ~468 | 整页偏好设置：`sections[]` 定义分类与控件，`initPreferences()` |
| `src/ui/sidebar.ts` | ~228 | 文件树 + 大纲：`createSidebar()` → `SidebarHandle` |
| `src/editor/code-languages.ts` | ~169 | 语言表 `LANG_DEFS`、按需加载、`reconfigureCodeLanguages()` |
| `src/editor/index.ts` | ~159 | 编辑器装配、Compartments、`createEditor()` → `EditorHandle` |
| `src/editor/format.ts` | ~156 | 格式化命令（标题/列表/引用/包裹/表格/链接…） |
| `src/ui/menu.ts` | ~155 | 菜单渲染：`createMenuBar(host, MenuDef[])` |
| `src/editor/langbadge.ts` | ~151 | 代码块右上角语言标签 |
| `src/editor/fence.ts` | ~146 | 围栏输入护栏：自动补结束围栏、空块退格、`↓`/点击空白出口 |
| `src/lib/ipc.ts` | ~65 | **唯一 IPC 出口**（invoke / listen / 窗口 API 都在这里） |
| `src/ui/dialog.ts` | ~56 | `askFileName()`、`toast()` |
| `src/settings/prefs.ts` | ~56 | 行为偏好持久化（`loadPrefs/savePrefs`） |
| `src/editor/keymap.ts` | ~55 | 代码块出口键位（↓ / 点击空白） |
| `src/editor/modes.ts` | ~54 | 专注模式、打字机模式（纯 CSS 类 + 滚动） |
| `src/settings/appearance.ts` | ~51 | 外观变量持久化与 `applyAppearance()` |
| `src/editor/outline.ts` | ~28 | `extractHeadings()` |
| `src/editor/code-highlight.ts` | ~16 | 代码配色 `HighlightStyle` |
| `src-tauri/src/lib.rs` | ~120 | Builder 装配、窗口尺寸、固定版本 WebView2 探测 |
| `src-tauri/src/commands/fs.rs` / `watch.rs` | — | 文件命令与监听 |
| `index.html` | — | DOM 骨架：`#menubar`、`#sidebar`、`#side-search`、`#editor`、`#statusbar`、`#prefs` … |

> 通常只需打开 2–4 个文件即可完成任务；`livepreview.ts` 与 `styles.css` 最重，改前先定位函数/选择器再局部读。

## 3. 装配顺序（`src/main.ts`）

1. `createEditor({...})` → `editor`（`EditorHandle`：`view` / `setDoc` / `setSourceMode` / `setFocusMode` / `setTypewriter`）
2. `createSidebar(...)` → `sidebar`（文件树、大纲、搜索）
3. `initPreferences(...)` → `preferences`（整页设置）
4. `applyAppearance()` / `applyZoom()`（`--editor-zoom`）
5. `createMenuBar($('#menubar'), [...])` —— **菜单项就写在 main.ts**（约 296 行）
6. 全局快捷键：`document.addEventListener('keydown')`

## 4. 数据流

- **打开文件**：`openFile()` → 先 `saveNow()` 旧文件 → `readFile` → `editor.setDoc()`（重建 state，隔离撤销栈）→ 显示编辑器 → `sidebar.expandPath()` + `setActiveFile()` → `refreshOutline()` → `watchFile()`
- **文件树刷新**：`openSingleFile()` 每次都会 `refreshTree()`（即使目录没变，防止树是旧快照）；窗口重新获得焦点时 300ms 防抖刷新一次
- **编辑**：`onChange` → `dirty` → 900ms 自动保存（读 `loadPrefs().autoSave`）→ 200ms 刷新大纲
- **外部改动**：`onFsChanged()` → 1.5s 内自己写的忽略 → 有未保存修改忽略 → `setDoc()` 并尽量保留光标
- **设置生效**：改完立即 `savePrefs` + 应用到 DOM；业务读取时**现取** `loadPrefs()`，不要缓存快照

## 5. 渲染模型（改渲染必读）

CodeMirror 有两条互斥路径：

| 类型 | 提供者 | 用于 |
| --- | --- | --- |
| 行内装饰 | `ViewPlugin`（`livepreview.ts` 的 `buildDecorations`） | 标题行、强调、链接、行内代码、列表、引用、代码块背景 |
| 块级装饰 | `StateField`（`blockField` + `collectBlocks`） | 表格、Mermaid 围栏、`$$...$$` 公式块 |

**CodeMirror 禁止插件提供 block decoration**（会抛 `Block decorations may not be specified via plugins`），所以新增整块替换必须走 `blockField`。

规则：

- 新增块级元素：在 `collectBlocks()` 里识别 → 在 `blockDecorations()` 里生成 widget → 同时在 `buildDecorations()` 的 `replaced()` 里跳过该区间，否则装饰重叠
- 光标进入块内自动显示源码（`head` 落在 `[from,to]` 时不替换）
- 表格 widget 的点击回源码依赖模块变量 `activeView`（StateField 拿不到 view）
- 行内公式走插件，跨行公式块走 StateField；两者用 `inCode()` / `replaced()` 去重

## 6. 常见任务配方

**加一条 Tauri 命令**

1. `src-tauri/src/commands/<domain>.rs` 写 `#[tauri::command] pub fn`，错误用 `Result<T, String>`
2. `commands/mod.rs` 加 `pub mod`
3. `lib.rs` 的 `generate_handler![]` 登记
4. `src/lib/ipc.ts` 加强类型 wrapper（命令名字符串只允许出现在这里）
5. 涉及新权限时改 `src-tauri/capabilities/default.json`

**加菜单项**：`main.ts` 的 `createMenuBar` 数组，`MenuItem` 支持 `label` / `hint` / `run` / `checked()` / `disabled()` / `submenu` / `separator`。菜单每次打开重建，勾选态用 `checked: () => loadPrefs().xxx`。

**加格式命令**：`src/editor/format.ts` 加函数（行级用 `rewriteLines`，行内用 `toggleWrap`）→ 菜单引用 → 需要快捷键时在 `src/editor/index.ts` 的 `keymap.of([...])` 里加 `Mod-?`。

**加偏好设置项**：`src/settings/prefs.ts` 扩接口与 `DEFAULT_PREFS` → `src/ui/preferences.ts` 对应分类的 `section()` 里加控件 → 使用处现取 `loadPrefs()`。

**加代码语言**：`pnpm add @codemirror/lang-x` → `code-languages.ts` 的 `LANG_DEFS` 追加一项（`id/label/aliases/hint/defaultOn/load`），设置里的勾选列表自动出现。

**改配色**：只改 `styles.css` 的 `:root` 与 `:root[data-theme="dark"]`；组件内不要写死颜色。

## 7. 已知坑

- 块级装饰只能来自 StateField（见上）
- Lezer 的加粗与斜体都叫 `EmphasisMark`，用 `isEmphasisMark()` 判断
- **不要用 CSS `zoom`** 缩放编辑器（CM 坐标会错位），用 `--editor-zoom` 字号倍率
- 页面/组件禁止直接 `invoke` / `listen`，只能 import `src/lib/ipc.ts`
- 浏览器（Vite 预览）里窗口 API 会抛错，`ipc.ts` 已统一 try/catch
- 围栏行只在光标**离开**后才折叠（`cm-fence-hidden`）并藏掉 ```；光标停在该行时必须露出源码，否则没法输入/修改语言。不要再把光标从围栏行重定向走
- 行内 widget 想用 `position: absolute` 摆放时（如语言标签 `cm-lang-anchor`），必须外面包一层**零尺寸、留在文档流里**的锚点：CM 用 widget 根节点的 rect 算光标坐标，根节点自己绝对定位的话，光标会被画到它的位置上（空行时表现为光标跑到右上角）
- Rust 返回给前端的结构体统一用 `#[serde(rename_all = "camelCase")]`（例如 `Node.is_dir` → `isDir`），前端按 `isDir` 判断目录；漏写会让所有目录被当成文件、无法展开
- localStorage 键：`md-editor.prefs` / `md-editor.appearance` / `md-editor.codeLangs` / `md-editor.root`
- 标题/全屏/关闭窗口需要 `capabilities/default.json` 的 `core:window:*` 权限
- `collectBlocks()` 每次都扫整篇文档，别在里面加昂贵的计算
- 绿色版：exe 同级若有 `Microsoft.WebView2.FixedVersionRuntime*` 会自动启用固定运行时（`lib.rs`），没有则回退系统 WebView2

## 8. 验证与交付

1. `pnpm build` 通过（`tsc` 会拦住类型问题）
2. `pnpm tauri dev` 能开窗口、菜单可用
3. 改动涉及打包时：`pnpm tauri build --no-bundle`，两种绿色版的打包方式见 [README](./README.md#打包绿色版)
4. 只改与任务相关的文件，不做顺手重构

## 9. 术语

`Compartment`（可运行时替换的扩展槽：预览/专注/打字机/代码语言）、`Decoration`（装饰）、`StateField`（文档级状态，可提供块级装饰）、`ViewPlugin`（视图插件，只能行内装饰）、`WidgetType`（自定义 DOM 片段）。
