# Hermes Console 第七第八阶段合并实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the current session. 本轮把第 7 阶段“官方对象可写闭环”和第 8 阶段“会话页稳定可用”合并执行：Profiles / Providers / Integrations 不再停留在只读同步，Chat 不再只会读取和发送，而是具备真实会话管理与更稳定的配置联动。

**Goal:** 打通 `Profiles / Providers / Integrations / Chat` 的真实操作闭环：
- `Profiles` 支持新建、克隆、重命名、设为默认、删除、导出、导入
- `Providers` 支持按 profile 写入默认 provider / model / custom endpoint / API key
- `Integrations` 支持按 profile 写入 gateway / API Server / 平台凭据，并通过实例启停实现网关启停/重启
- `Chat` 支持真实会话重命名、删除、清空上下文（回到新会话态），并在 profile/provider 未就绪时给出诚实可执行的错误

**Architecture:** 继续沿用双真相源。Console 注册表仍负责实例索引；单个实例内部的真实可写状态仍回到 Hermes 官方 CLI 与配置目录：
- `hermes profile *`
- `hermes config set *`
- `state.db` / `sessions`
- 当前实例运行态（Docker 容器 / SSH）

对于配置写入，优先走 Hermes 官方 `config set`，避免自行重写 `config.yaml` / `.env` 造成格式漂移；对于会话管理，优先走 Hermes 官方 `sessions rename/delete`；对于 gateway 启停，沿用 Console 当前真实实例运行时控制（start/stop/restart instance），不伪装成未接通的 Hermes system service。

**Tech Stack:** React 18、TypeScript、Electron、Node.js ESM、本机 Hermes CLI、SSH、现有 instance/runtime/officialState/workspace 桌面服务。

---

## File Map

### Create
- `ui/desktop/services/hermes-official-actions.mjs`
  - profile/provider/integration 写操作与运行时控制适配
- `ui/src/app/services/officialActions.ts`
  - 前端官方对象动作封装

### Modify
- `ui/desktop/services/hermes-official-state.mjs`
  - 支持按 `profileId` 读取 provider / integration 状态
- `ui/desktop/services/workspace-state.mjs`
  - 补会话重命名 / 删除动作与发送稳定性补强
- `ui/desktop/main.mjs`
  - 注册官方动作与会话管理 IPC
- `ui/desktop/preload.mjs`
  - 暴露官方动作与会话管理 API
- `ui/src/hermes-desktop.d.ts`
  - 补 profile/provider/integration actions 与 session actions 类型
- `ui/src/app/services/officialState.ts`
  - 支持按 profile 读取官方状态
- `ui/src/app/services/workspace.ts`
  - 补会话 rename/delete 调用
- `ui/src/app/pages/instance/Profiles.tsx`
  - 接真实 profile 写动作
- `ui/src/app/pages/instance/Providers.tsx`
  - 接真实 provider/model 写动作与 profile 选择
- `ui/src/app/pages/instance/Integrations.tsx`
  - 接真实 gateway/config 写动作与 profile 选择
- `ui/src/app/pages/instance/Chat.tsx`
  - 接真实 rename/delete/clear context / profile-ready gating

---

## Validation Strategy

### 服务级验证
- `profile create / rename / use / delete / export / import` 在临时 `HERMES_HOME` 下跑通
- `config set` 对 `model.provider / model.default / model.base_url / model.api_key / plugins.enabled / API_SERVER_ENABLED / TELEGRAM_BOT_TOKEN` 等字段写入正确目标 profile
- 远程实例在缺少 SSH 私钥时返回真实错误，不伪装成功
- `sessions rename / delete` 能在临时 `state.db` 上得到真实回流
- 发送会话时：
  - provider/model 已配置则正常执行
  - provider/model 未配置或 CLI 返回非零时，返回真实错误并保留可恢复状态

### 构建验证
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

### 桌面态回归
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- 验收路径：
  - `/instance/local-studio/profiles`
  - `/instance/local-studio/providers`
  - `/instance/local-studio/integrations`
  - `/instance/local-studio/chat`
  - `/instance/remote-gateway/profiles`
  - `/instance/remote-gateway/providers`
  - `/instance/remote-gateway/integrations`
  - `/instance/remote-gateway/chat`

### 诚实交互约束
- 不能把未接通的 OAuth 登录伪装成“立即完成”
- 不能把未部署/未运行实例伪装成可启用 gateway
- 不能把 provider 未配置完成的 profile 伪装成“可稳定聊天”
- 不能把 import/export 做成假按钮；若远程只支持路径级导入导出，必须明确显示路径语义

---

### Task 1: 建立官方对象写操作桌面服务

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/hermes-official-actions.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/hermes-official-state.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/hermes-desktop.d.ts`

- [ ] **Step 1: 建立 profile 动作**
  - create / clone / rename / use / delete / export / import
  - 本地与远程统一通过 Hermes CLI / SSH 执行
- [ ] **Step 2: 建立 provider 写动作**
  - 支持按 `profileId` 写 `model.provider` / `model.default` / `model.base_url` / `model.api_key`
  - 支持 provider 对应 env 字段写入
- [ ] **Step 3: 建立 integration 写动作**
  - 支持按 `profileId` 写 gateway / API server / 平台字段
  - 支持 plugins.enabled / API_SERVER_ENABLED
- [ ] **Step 4: 建立 gateway 运行时动作**
  - start / stop / restart 映射到实例运行时控制
- [ ] **Step 5: 让官方状态读取支持 `profileId`**
- [ ] **Step 6: 提交本任务**
  - 提交信息：`实现官方对象写操作桌面服务`

---

### Task 2: 建立前端官方动作封装

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/officialActions.ts`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/officialState.ts`

- [ ] **Step 1: 封装 profile 动作 API**
- [ ] **Step 2: 封装 provider/integration 动作 API**
- [ ] **Step 3: 封装 gateway start/stop/restart API**
- [ ] **Step 4: 支持按 `profileId` 读取官方状态**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`建立前端官方动作服务封装`

---

### Task 3: 接通 Profiles / Providers / Integrations 页真实动作

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Profiles.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Providers.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Integrations.tsx`

- [ ] **Step 1: Profiles 接真实 create/clone/rename/use/delete/export/import**
- [ ] **Step 2: Providers 增加 profile 选择并接真实保存动作**
- [ ] **Step 3: Integrations 增加 profile 选择并接真实保存动作**
- [ ] **Step 4: Integrations 接真实实例级 gateway 启停/重启**
- [ ] **Step 5: 清理剩余假按钮与待接线文案**
- [ ] **Step 6: 提交本任务**
  - 提交信息：`接通官方对象页面真实可写动作`

---

### Task 4: 接通 Chat 页面真实会话管理与稳定性

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/workspace-state.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/workspace.ts`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Chat.tsx`

- [ ] **Step 1: 增加会话 rename/delete 桌面动作**
- [ ] **Step 2: Chat 接 rename/delete/new-session/clear-context 真动作**
- [ ] **Step 3: 发送前接 profile/provider readiness gating**
- [ ] **Step 4: 失败回流更具体，避免“看起来发送成功”**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`接通会话页真实管理动作并收紧发送稳定性`

---

### Task 5: 第七第八阶段整体验收与回归

- [ ] **Step 1: 服务级验证**
  - 本地临时 `HERMES_HOME` 验证 profile/provider/integration/session 动作
  - 远程缺失 SSH 私钥负路径验证
- [ ] **Step 2: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`
- [ ] **Step 3: 桌面开发链回归**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- [ ] **Step 4: 路由与交互回归**
  - Profiles / Providers / Integrations / Chat
  - 本地/远程路径都要走一遍
- [ ] **Step 5: 修复回归问题并再次验证**
- [ ] **Step 6: 提交本任务**
  - 提交信息：`完成第七第八阶段开发与验收`
