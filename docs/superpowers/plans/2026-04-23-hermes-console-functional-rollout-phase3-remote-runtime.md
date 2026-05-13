# Hermes Console 第三阶段远程实例闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the current session. 本计划承接“远程 SSH 环境探测”之后的剩余工作，把远程实例从只读预检推进到真实注册、远程 Docker 启停/状态读取，以及实例内官方状态同步。

**Goal:** 打通第三阶段剩余闭环：基于 SSH 私钥模式创建远程 Docker 实例，注册到 Console，支持远程启动 / 停止 / 状态读取，并让远程实例的 Overview / Profiles / Providers / Integrations 读取真实远程 `HERMES_HOME` 状态。

**Architecture:** 继续沿用双真相源架构。Console 注册表保存远程实例索引与 SSH 连接元数据；远程运行与远程官方状态通过 Electron 主进程受控调用 SSH 获取。为避免把密码明文持久化到注册表，本阶段**真实远程创建与后续管理仅支持 SSH 私钥模式**；密码模式保留给第 2 步环境预检。

**Tech Stack:** React 18、TypeScript、Electron、Node.js ESM、本机 `ssh`、远程 Linux + Docker、现有实例注册表与桌面 bridge。

---

## File Map

### Create

- `ui/desktop/services/remote-instance.mjs`
  - 远程 Docker 实例创建、远程目录初始化、远程运行时 metadata

### Modify

- `ui/desktop/services/instance-registry.mjs`
  - 允许存储远程连接元数据与远程 Docker 元数据
- `ui/desktop/services/instance-state.mjs`
  - 扩展远程 Docker 的状态读取、启动、停止
- `ui/desktop/services/hermes-official-state.mjs`
  - 为远程实例增加 SSH 读取 `config.yaml / .env / auth.json / profiles` 能力
- `ui/desktop/main.mjs`
  - 注册远程实例创建 API
- `ui/desktop/preload.mjs`
  - 暴露远程实例创建 API
- `ui/src/hermes-desktop.d.ts`
  - 扩展远程实例类型、创建输入输出、连接元数据
- `ui/src/app/services/instances.ts`
  - 增加远程实例创建接口与类型
- `ui/src/app/services/runtime.ts`
  - 让远程实例状态映射成 UI 可消费摘要
- `ui/src/app/pages/CreateInstance.tsx`
  - 第 5 步接远程 Docker 部署真链路
- `ui/src/app/pages/instance/Overview.tsx`
  - 远程实例概览态回流与动作提示收口

---

## Validation Strategy

### 服务级验证
- SSH 私钥模式下可创建远程实例 DTO
- 缺少私钥时，远程部署返回结构化错误
- 远程 Docker / health / 容器状态读取返回结构化结果
- 远程 `HERMES_HOME` 缺失时，官方状态读取返回诚实错误或空摘要，不伪造成功

### 构建验证
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

### 桌面态回归
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- 验收路径：
  - `/create?type=remote`
  - `/instance/remote-gateway`
  - `/instance/remote-gateway/profiles`
  - `/instance/remote-gateway/providers`
  - `/instance/remote-gateway/integrations`

### 诚实交互约束
- 远程密码模式继续允许“读取环境”，但**不允许**进入真实远程部署
- 远程 Native 仍保持 disabled / 不支持
- 远程实例失败时必须回写注册表失败状态，不得伪装成 running

---

### Task 1: 扩展远程实例数据模型

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/instance-registry.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/hermes-desktop.d.ts`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/instances.ts`

- [ ] **Step 1: 为实例记录补充远程连接元数据**
  - `remote.host / port / user / authMode / keyPath / workdir`
  - 不持久化 password
- [ ] **Step 2: 为远程 Docker 记录补充端口与容器元数据**
- [ ] **Step 3: 保持现有本地实例兼容**
- [ ] **Step 4: 提交本任务**
  - 提交信息：`扩展远程实例注册表与类型模型`

---

### Task 2: 实现远程 Docker 实例创建

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/remote-instance.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`

- [ ] **Step 1: 仅允许 SSH 私钥模式进入远程部署**
- [ ] **Step 2: 远程初始化实例目录与 `HERMES_HOME`**
  - 远程 `workspaceDir`
  - 远程 `home`
  - 远程 `runtime`
  - 远程最小 bootstrap 文件
- [ ] **Step 3: 远程执行 Docker run**
  - `nousresearch/hermes-agent:latest gateway run`
  - 端口默认为远程 `8642`
- [ ] **Step 4: 注册远程实例并回写失败/成功状态**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`实现远程 Docker 实例创建闭环`

---

### Task 3: 实现远程实例启停与状态探测

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/instance-state.mjs`

- [ ] **Step 1: 远程容器 inspect / logs / health 检查**
- [ ] **Step 2: 扩展 `getInstanceState / listInstanceStates` 支持远程 Docker**
- [ ] **Step 3: 扩展 `startInstance / stopInstance` 支持远程 Docker**
- [ ] **Step 4: 回写运行时 metadata 与注册表状态**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`实现远程实例启停与状态探测`

---

### Task 4: 实现远程实例官方状态读取

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/hermes-official-state.mjs`

- [ ] **Step 1: 为远程实例增加 SSH 文件读取适配层**
- [ ] **Step 2: 读取远程 `config.yaml / .env / auth.json / profiles`**
- [ ] **Step 3: 保持 Profiles / Providers / Integrations 现有 DTO 不变**
- [ ] **Step 4: 提交本任务**
  - 提交信息：`接入远程实例官方状态同步`

---

### Task 5: 接入创建流程与界面回流

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/CreateInstance.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/runtime.ts`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Overview.tsx`

- [ ] **Step 1: 第 5 步远程 Docker 走真实部署 API**
- [ ] **Step 2: 密码模式部署保持禁用并给出真实提示**
- [ ] **Step 3: 远程创建成功页显示真实目录 / endpoint / 容器信息**
- [ ] **Step 4: Overview 与状态摘要映射远程运行态**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`接入远程实例创建流程与状态回流`

---

### Task 6: 第三阶段整体验收与回归

- [ ] **Step 1: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`
- [ ] **Step 2: 桌面开发链回归**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- [ ] **Step 3: 路由与交互回归**
  - `/create?type=remote`
  - `/instance/remote-gateway`
  - `/instance/remote-gateway/profiles`
  - `/instance/remote-gateway/providers`
  - `/instance/remote-gateway/integrations`
- [ ] **Step 4: 修复回归问题并再次验证**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`完成远程实例闭环阶段验收`
