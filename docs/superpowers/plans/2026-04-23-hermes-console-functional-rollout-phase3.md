# Hermes Console 第三阶段功能对接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the current session. 本阶段开始接通远程实例，但先把最关键的 SSH 环境探测打透，不在同一轮里把远程部署、远程 provider/profile/gateway 写操作全部混在一起。

**Goal:** 打通远程实例闭环的第一子阶段：通过 SSH 对远程 Linux 主机做真实环境探测，并把结果回流到“创建实例”第 2 步。远程信息不再是假摘要，而是来自真实 SSH 连通性、目录权限、Docker、磁盘与端口检查。

**Architecture:** 继续沿用双真相源架构。Console 负责远程实例目录索引；远程环境状态通过本机 Electron 主进程受控调用 `ssh`/`expect` 获得。远程探测阶段只做**只读环境检查**，还不执行远程部署与远程启停。

**Tech Stack:** React 18、TypeScript、Electron、Node.js ESM、本机 `ssh`、本机 `expect`（用于密码认证）、现有 `CreateInstance` 页面与桌面 bridge。

---

## File Map

### Create

- `ui/desktop/services/ssh-runtime.mjs`
  - 远程 SSH 受控调用，支持私钥与密码认证
- `ui/desktop/services/remote-environment.mjs`
  - 远程 Linux 环境探测聚合

### Modify

- `ui/desktop/main.mjs`
  - 注册 `inspectRemoteEnvironment` IPC handler
- `ui/desktop/preload.mjs`
  - 暴露远程环境探测 API
- `ui/src/hermes-desktop.d.ts`
  - 补远程环境探测类型
- `ui/src/app/services/system.ts`
  - 前端远程环境调用封装
- `ui/src/app/pages/CreateInstance.tsx`
  - 远程实例第 2 步切到真实 SSH 环境检查

---

## Validation Strategy

### 服务级验证
- 参数缺失时返回结构化错误：
  - host 为空
  - user 为空
  - 私钥路径为空
  - password 为空
- 本机环境验证：
  - `ssh` 可发现
  - `expect` 可发现（密码模式）
- 无法连接远程主机时，也必须返回真实 SSH 错误，不得伪造“已读取环境”

### 构建验证
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

### 桌面态回归
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- 验收路径：
  - `/create?type=remote`

### 诚实交互约束
- 只有 SSH 探测成功后，远程第 2 步才能显示“已读取环境”
- 若密码模式依赖 `expect` 不满足，必须在 UI 里返回真实可恢复错误
- 本阶段远程部署仍保持 disabled / 不支持，不制造“已经可以远程部署”的错觉

---

### Task 1: 实现 SSH 受控调用服务

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/ssh-runtime.mjs`

- [ ] **Step 1: 定义远程连接输入 DTO**
  - host / port / user / authMode / keyPath / password / workdir

- [ ] **Step 2: 实现私钥模式 SSH 调用**
  - 受控 `ssh` 参数
  - 连接超时
  - 结构化 stdout / stderr / exitCode

- [ ] **Step 3: 实现密码模式 SSH 调用**
  - 通过 `expect` 包装 `ssh`
  - 若 `expect` 不存在，返回结构化错误

- [ ] **Step 4: 统一错误类型**
  - `SSH_BINARY_MISSING`
  - `EXPECT_BINARY_MISSING`
  - `SSH_AUTH_REQUIRED`
  - `SSH_CONNECTION_FAILED`
  - `SSH_TIMEOUT`

- [ ] **Step 5: 提交本任务**
  - 提交信息：`实现远程 SSH 受控调用服务`

---

### Task 2: 实现远程环境探测服务

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/remote-environment.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/hermes-desktop.d.ts`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/system.ts`

- [ ] **Step 1: 远程执行只读预检脚本**
  - SSH 连通性
  - 操作系统 / hostname / arch
  - 远程工作目录是否可写
  - Hermes CLI 是否存在
  - Docker binary / daemon 状态
  - 磁盘可用空间
  - 默认端口是否冲突

- [ ] **Step 2: 聚合为稳定 DTO**
  - `ssh`
  - `system`
  - `directory`
  - `hermes`
  - `docker`
  - `disk`
  - `port`

- [ ] **Step 3: 暴露 `inspectRemoteEnvironment(input)` bridge API**

- [ ] **Step 4: 服务级自测**
  - 缺失参数
  - 无法连接
  - 本机 binary 存在性

- [ ] **Step 5: 提交本任务**
  - 提交信息：`实现远程环境探测服务`

---

### Task 3: 接入创建实例远程环境检查真实状态

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/CreateInstance.tsx`

- [ ] **Step 1: 接入远程环境探测调用**
  - “读取环境”按钮走真实 SSH 检查

- [ ] **Step 2: 替换假检查结果**
  - SSH 连通性
  - 用户权限
  - Docker 可用性
  - 磁盘空间
  - 端口冲突

- [ ] **Step 3: 收口加载态 / 错误态 / 失效态**
  - 修改主机/用户/认证后自动失效旧检查结果
  - 失败时展示真实错误

- [ ] **Step 4: 保持部署诚实边界**
  - 即使检查通过，当前轮仍不伪装远程部署已接通

- [ ] **Step 5: 提交本任务**
  - 提交信息：`接入远程实例环境检查真实状态`

---

### Task 4: 第三阶段第一子阶段验收与回归

- [ ] **Step 1: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 2: 桌面开发链回归**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`

- [ ] **Step 3: 路由与交互回归**
  - `/create?type=remote`
  - 导入历史连接
  - 切换 SSH 私钥 / 密码模式
  - 点击“读取环境”后的真实反馈

- [ ] **Step 4: 如有必要，修复回归问题并再次验证**

- [ ] **Step 5: 提交本任务**
  - 提交信息：`完成远程环境检查阶段验收`
