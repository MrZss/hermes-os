# Hermes Console 第六阶段工作区真实化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the current session. 本阶段把实例内“会话 / 工作区上下文”从静态演示页收口成真实桌面能力：真实读取 profile 维度会话历史、真实读取工作区上下文，并把发送动作接到 Hermes CLI。

**Goal:** 打通第 6 阶段：`Chat` 页面不再展示硬编码会话，而是按当前实例 + 当前 profile 读取真实会话列表、真实消息转录、真实工作区摘要，并支持通过 Hermes CLI 发起新会话或继续既有会话。

**Architecture:** 沿用双真相源。实例目录索引仍由 Console 注册表维护；工作区真相源来自当前实例/当前 profile 的 `HERMES_HOME`：`state.db` / `sessions/` / `workspace/` / `config.yaml` / `.env` / `logs/`。本地实例通过 Electron 主进程直接读取文件与运行 Hermes CLI；远程实例通过 SSH 在远端读取 profile 目录、SQLite 会话库和工作区摘要。

**Tech Stack:** React 18、TypeScript、Electron、Node.js ESM、本机 Hermes CLI、本机/远程 Python 3（标准库 sqlite3）、SSH、现有官方状态同步层。

---

## File Map

### Create
- `ui/desktop/services/workspace-state.mjs`
  - profile 维度会话列表、消息转录、工作区上下文、真实 chat query 动作
- `ui/src/app/services/workspace.ts`
  - 前端工作区/会话调用封装

### Modify
- `ui/desktop/services/hermes-cli.mjs`
  - 扩展 chat 相关受控调用支持
- `ui/desktop/main.mjs`
  - 注册 workspace/session IPC
- `ui/desktop/preload.mjs`
  - 暴露 workspace/session API
- `ui/src/hermes-desktop.d.ts`
  - 补会话、消息、工作区上下文与 chat 动作类型
- `ui/src/app/pages/instance/Chat.tsx`
  - 改成真实会话三栏页

---

## Validation Strategy

### 服务级验证
- 本地 profile 没有 `state.db` 时，返回空会话列表，不伪造历史
- 远程 SSH / 私钥缺失时，返回真实错误，不伪造会话内容
- 发送 query 时：
  - 成功则返回真实 `session_id` 与最新转录
  - Hermes CLI 返回非零或没有 assistant 回复时，返回真实失败，不伪装已发送成功
- profile 切换后，会话列表与工作区摘要必须切到对应 profile 目录

### 构建验证
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

### 桌面态回归
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- 验收路径：
  - `/instance/local-studio/chat`
  - `/instance/remote-gateway/chat`

### 诚实交互约束
- 未接通的“添加上下文 / 清空上下文”不能继续伪装成可用动作
- 会话发送中必须有明确 loading 态
- 没有工作区内容时显示空态，不再铺固定案例文本

---

### Task 1: 建立桌面端工作区与会话服务

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/workspace-state.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/hermes-cli.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/hermes-desktop.d.ts`

- [ ] **Step 1: 解析实例下的 profile 目录**
  - default profile = `instance.hermesHome`
  - named profile = `instance.hermesHome/profiles/<id>`
- [ ] **Step 2: 实现会话列表 / 转录读取 DTO**
  - 读取 `state.db`
  - 返回 session summary
  - 返回 message transcript
- [ ] **Step 3: 实现工作区上下文 DTO**
  - profile home 路径
  - workspace 路径
  - config/env/SOUL 是否存在
  - top-level workspace entries
  - logs / backups / session 计数
- [ ] **Step 4: 实现真实 chat query 动作**
  - `hermes chat -Q -q ...`
  - 支持 `--resume <session_id>`
  - 支持 `--profile <name>`
  - 成功/失败都回传真实结果
- [ ] **Step 5: 提交本任务**
  - 提交信息：`实现工作区会话与上下文桌面服务`

---

### Task 2: 建立前端工作区服务封装

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/workspace.ts`

- [ ] **Step 1: 封装会话列表调用**
- [ ] **Step 2: 封装会话详情调用**
- [ ] **Step 3: 封装工作区上下文调用**
- [ ] **Step 4: 封装 chat 发送动作**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`建立前端工作区服务封装`

---

### Task 3: 接入 Chat 页面真实状态

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Chat.tsx`

- [ ] **Step 1: 左栏接真实会话列表与搜索过滤**
- [ ] **Step 2: 中栏接真实消息转录与发送动作**
- [ ] **Step 3: 右栏接真实工作区上下文与 profile/provider/gateway 摘要**
- [ ] **Step 4: 清掉剩余假交互**
  - 新建 = 进入空白新会话态
  - 清空上下文 = 当前轮不接则 disabled
  - 添加上下文 = disabled
- [ ] **Step 5: 提交本任务**
  - 提交信息：`接入会话页真实会话与工作区上下文`

---

### Task 4: 第六阶段整体验收与回归

- [ ] **Step 1: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`
- [ ] **Step 2: 桌面开发链回归**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- [ ] **Step 3: 路由与交互回归**
  - `/instance/local-studio/chat`
  - `/instance/remote-gateway/chat`
  - profile 切换
  - 新建会话
  - 发送 query 的成功 / 失败回流
- [ ] **Step 4: 修复回归问题并再次验证**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`完成工作区真实化阶段验收`
