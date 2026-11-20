# 第三方组件与许可声明

本项目自身代码以 [MIT](./LICENSE) 协议开源。程序内使用的第三方组件如下，遵守各自许可，均允许个人与商业使用，无版税、无授权费用。

## 随程序分发的运行时组件

| 组件 | 许可 | 用途 |
| --- | --- | --- |
| [CodeMirror 6](https://codemirror.net/) 及 `@codemirror/*` | MIT | 编辑器内核（编辑、选区、撤销、搜索、语言包） |
| [Lezer](https://lezer.codemirror.net/) 及 `@lezer/*` | MIT | 增量语法解析 |
| [KaTeX](https://katex.org/) | MIT | 数学公式排版 |
| [Mermaid](https://mermaid.js.org/) | MIT | 流程图 / 时序图等图表渲染 |
| [cytoscape](https://js.cytoscape.org/) | MIT | Mermaid 的图布局依赖 |
| [chevrotain](https://chevrotain.io/) | Apache-2.0 | Mermaid 的语法解析器 |
| [elkjs](https://github.com/kieler/elkjs) | EPL-2.0 | Mermaid 的 ELK 布局算法 |
| [DOMPurify](https://github.com/cure53/DOMPurify) | MPL-2.0 或 Apache-2.0（本项目按 Apache-2.0 使用） | Mermaid 输出净化 |
| [robust-predicates](https://github.com/mourner/robust-predicates) | Unlicense | 几何计算依赖 |
| [@braintree/sanitize-url](https://github.com/braintree/sanitize-url) | MIT | URL 净化 |

## 桌面容器与系统能力（Rust，静态链接进可执行文件）

- [Tauri 2](https://tauri.app/)：MIT 或 Apache-2.0
- `serde` / `serde_json`：MIT 或 Apache-2.0
- `tokio`：MIT
- `notify`（文件监听）：MIT
- `windows` / `windows-sys`：MIT 或 Apache-2.0

完整 Rust 依赖及其许可见 `src-tauri/Cargo.lock`；其中绝大多数为 MIT / Apache-2.0 / BSD-3-Clause 等宽松许可，含少量 MPL-2.0 组件，均未修改。

## 仅构建期使用（不随程序分发）

TypeScript（Apache-2.0）、Vite（MIT）、lightningcss（MPL-2.0）、`@tauri-apps/cli`（MIT 或 Apache-2.0）等，只参与编译打包，不进入最终产物。

## 合规结论

- 依赖中**没有 GPL / AGPL 等强著佐权许可**，分发本程序不会要求公开本项目源码
- 所有组件均允许商业使用，不存在收费、版税或按用户数计费的条款
- MIT / ISC / BSD / Apache-2.0 的义务是保留版权与许可声明，本文件即用于满足该义务；各组件完整许可文本随源码一同发布于上表链接及 `node_modules` 中对应包的 `LICENSE` 文件
- EPL-2.0（elkjs）与 MPL-2.0 组件均按原样使用、未做修改，其源码可在上述上游仓库获取
- 界面使用系统自带字体，不内嵌、不再分发任何商业字体

## 第三方运行时

- **Microsoft Edge WebView2 Runtime**
  - 普通绿色版：使用系统已安装的 Evergreen 运行时，不随包分发
  - 完全绿色版：随包附带 WebView2 **固定版本**运行时（133.0.3065.92，x64），仅原样分发、未做任何修改，版权归 Microsoft，使用须遵守 [Microsoft Edge WebView2 Runtime 许可条款](https://developer.microsoft.com/microsoft-edge/api/eula/webview2)
  - 该运行时不属于本项目，也不受本项目 MIT 协议约束

清单可用 `pnpm licenses list` 复核。
