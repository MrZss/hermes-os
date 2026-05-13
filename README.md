# Hermes Console

[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-blue)](.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848f)](ui/package.json)

Hermes Console 是面向 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 的桌面控制台。它把 Hermes 的本地/远程实例创建、环境检查、AI 提供商配置、消息平台接入和会话调试集中到一个简单的 macOS / Windows 客户端里，目标是让新用户用最少配置把 Hermes 跑起来。

> 当前项目以中文界面和中文文档为主。README 面向开源用户，`docs/` 目录保留产品基线、页面规则和 Codex 开发约束。

## 功能特性

- **实例管理**：创建、导入和管理本地实例与远程服务器实例。
- **环境检查**：在创建/导入流程中检查 Hermes CLI、运行服务、SSH 与网关状态。
- **AI 提供商配置**：支持按 provider 配置 API Key / OAuth，并在保存时自动测试。
- **消息平台接入**：保留 Telegram、微信、QQ、飞书等 Hermes 原生消息平台配置入口。
- **会话体验**：提供接近真实 AI 对话的桌面会话页，支持实例配置完整性提示。
- **安装包输出**：支持 macOS universal DMG/ZIP 与 Windows x64 NSIS/portable 打包。

## 快速开始

完整操作流程见 [docs/USAGE.md](docs/USAGE.md)。

### 环境要求

- Node.js 20 或更高版本（当前开发环境使用 Node 25）
- npm 10 或更高版本
- macOS 开发打包：macOS 主机
- Windows 安装包交叉打包：macOS/Linux 可通过 `electron-builder` 产出 NSIS/portable 包
- Hermes 运行能力：本机或远程环境需可安装/运行 Hermes CLI

### 安装依赖

```bash
cd ui
npm ci
```

### 启动桌面开发版

```bash
cd ui
npm run desktop:dev
```

该命令会启动 Vite 开发服务器并打开 Electron 客户端。默认地址为 `http://127.0.0.1:4174/`。

## 开发

常用命令：

```bash
cd ui
npm run build          # 构建前端 dist
npm run desktop        # 使用已构建/当前入口启动 Electron
npm run desktop:dev    # 热更新开发模式
```

运行全部静态测试：

```bash
for f in ui/tests/*.test.mjs; do
  node "$f"
done
```

项目当前没有引入独立测试框架，`ui/tests/*.test.mjs` 使用 Node.js 标准库做结构、文案和行为边界断言。

## 打包发布

下载文件命名和系统选择见 [docs/DOWNLOADS.md](docs/DOWNLOADS.md)。

```bash
cd ui
npm run pack:mac       # macOS x64 + arm64 DMG/ZIP
npm run pack:win       # Windows x64 NSIS 安装包 + portable 包
npm run pack:all       # 同时构建 macOS 与 Windows 产物
```

产物输出到 `ui/release/`：

- `Hermes-Console-<version>-mac-x64.dmg`
- `Hermes-Console-<version>-mac-x64.zip`
- `Hermes-Console-<version>-mac-arm64.dmg`
- `Hermes-Console-<version>-mac-arm64.zip`
- `Hermes-Console-<version>-win-x64-Setup.exe`
- `Hermes-Console-<version>-win-x64.exe`

> 注意：默认配置用于本地/测试分发。正式公开发布前，需要补充 Apple Developer ID 签名与 notarization，以及 Windows 代码签名证书，否则用户可能看到 Gatekeeper 或 SmartScreen 提示。

## 项目结构

```txt
.
├── docs/                    # 产品基线、页面规格、UI 规则、Codex 开发约束
├── ui/
│   ├── desktop/             # Electron 主进程、preload、桌面服务
│   ├── src/                 # React 前端应用
│   ├── tests/               # Node 静态/行为边界测试
│   ├── public/              # 品牌资源和静态资源
│   └── package.json         # 前端、桌面端和打包配置
├── .github/                 # GitHub issue/PR 模板和 CI
├── CONTRIBUTING.md          # 贡献指南
├── SECURITY.md              # 安全政策
├── CODE_OF_CONDUCT.md       # 社区行为准则
└── LICENSE                  # MIT License
```

## 参与贡献

欢迎提交 Issue 和 Pull Request。开始前建议先阅读：

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [docs/PRODUCT_BASELINE_Hermes_Console_v1.md](docs/PRODUCT_BASELINE_Hermes_Console_v1.md)
- [docs/UI_RULES.md](docs/UI_RULES.md)

提交 PR 前请至少运行：

```bash
for f in ui/tests/*.test.mjs; do node "$f"; done
cd ui && npm run build
```

## 安全

如果你发现安全问题，请不要直接公开攻击细节。请先阅读 [SECURITY.md](SECURITY.md)，通过安全政策中列出的方式提交复现路径、影响范围和建议修复方向。

## 路线图

- 更完整的 Hermes 官方配置回读与状态解释
- 更稳定的远程实例导入/诊断体验
- 正式签名和自动发布流水线
- 更完善的端到端桌面验收脚本

## 许可证

Hermes Console 使用 [MIT License](LICENSE) 开源。
