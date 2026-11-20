# AGENTS.md — 项目规则

> 代码地图、常见改动配方与已知坑见 [AI.md](./AI.md)。用 AI 改这个项目时请先读它，再按需打开少数文件。

Windows 桌面应用。目标：轻量、启动快、界面好看。

## 1. 技术栈（锁定，不可更换）

- 桌面框架：**Tauri 2**。禁止引入 / 迁移到 Electron、WinUI 3、WPF、MAUI、Flutter 等任何其他桌面容器。
- 前端：当前脚手架为 Vite + TypeScript（vanilla-ts）。**不更换前端框架**；不要擅自引入 React/Vue/Svelte 等，确需更换必须先与我确认。
- 包管理器：**pnpm**。不要混用 npm / yarn。

## 2. Rust 侧职责边界

- Rust 只做系统能力：文件系统、进程、窗口/托盘、注册表、系统信息、原生 API 封装等。
- 不在 Rust 里写业务编排、状态机、界面呈现相关逻辑；这部分放前端。
- **所有 `#[tauri::command]` 必须集中在 `src-tauri/src/commands/`，按领域分文件**（每个领域一个文件），例如：
  - `commands/mod.rs`：只做 `pub mod xxx;` 与统一导出
  - `commands/fs.rs`、`commands/window.rs`、`commands/system.rs` …
- `lib.rs` 只保留 `Builder` 装配与 `generate_handler![]` 汇总，不写具体 command 实现。
  - 推荐各领域模块暴露 `pub fn handler() -> impl Fn(tauri::ipc::Invoke) -> bool`，或在 `lib.rs` 中集中列出 `commands::xxx::yyy`。
- command 的入参/返回值统一用 `serde` 可序列化结构体，错误统一返回 `Result<T, String>`（或项目统一的错误类型），禁止 `unwrap()` / `expect()` 处理可预期失败。

## 3. 前端调用规范

- **禁止在页面/组件里直接 `invoke()`**，也禁止直接用 `window.__TAURI__`。
- 所有 IPC 调用统一收敛到**唯一一个封装文件**：`src/lib/ipc.ts`（新增领域时在其中加函数，不要另建第二个调用入口）。
  - 该文件内统一 `import { invoke } from '@tauri-apps/api/core'`，导出强类型函数，例如 `export const readFile = (path: string) => invoke<string>('read_file', { path })`。
  - 命令名字符串只允许出现在该文件里；业务代码只 import 这些函数。
- 事件监听（`listen`）同样在 `src/lib/ipc.ts` 暴露，不散落。

## 4. 依赖引入

- 新增任何前端/ Rust 依赖前，先说明：**用途、替代的原生实现、包体积 / 编译时间影响**，得到我确认后再装。
- 能用原生（标准库 / Web API / Tauri 内置 API）实现的不引包。
- **不整包引入 UI 库**（如 Element Plus、Ant Design、Naive UI、MUI 之类）。需要组件就手写或用无样式的 headless 原子件，按需、单文件引入。
- 不引入 CSS 框架全家桶；样式以原生 CSS / CSS 变量为主。

## 5. 交付标准

- **每次改完必须跑通 `pnpm tauri dev`（能编译通过、窗口正常打开）才算完成**；只过前端 `pnpm dev` 不算。
- 只改与任务相关的必要文件，不碰无关代码、不做顺手重构、不改格式化风格。
- 不提交 `src-tauri/target/`、`node_modules/`、`dist/`。
- 修 bug 时先定位根因再动手；改完说明改了哪些文件、为什么。

## 6. 约定

- 界面文案中文，注释按需中文；代码标识符英文。
- 窗口默认轻量：不引入重量级图标库，图标用内联 SVG。
