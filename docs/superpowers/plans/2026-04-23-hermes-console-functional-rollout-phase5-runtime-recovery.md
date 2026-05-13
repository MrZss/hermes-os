# Hermes Console 第五阶段运行与恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the current session. 本计划承接远程实例闭环之后的下一阶段，把实例运行观察与恢复链路接通到真实桌面能力。

**Goal:** 打通第 5 阶段：实例日志真实读取、基础诊断真实回流、备份真实创建/列出/恢复，并接入 `Logs` 与 `Backups` 页面。保持当前产品的诚实交互原则，不制造“看起来可恢复、其实是摆设”的假动作。

**Architecture:** 沿用双真相源。实例运行期状态依旧由实例目录、Docker/SSH 和 Hermes CLI/日志文件给出；Console 只维护实例索引和 backup artifact 位置。日志优先从实例 `HERMES_HOME/logs` 与 Docker 输出获取；诊断优先复用 `status/doctor`、Docker inspect、SSH 预检；备份优先写入实例 `workspaceDir/backups`。

**Tech Stack:** React 18、TypeScript、Electron、Node.js ESM、本机 `ssh`、本机 Hermes CLI、远程 Linux shell、zipfile/tar 辅助脚本。

---

## File Map

### Create
- `ui/desktop/services/instance-runtime.mjs`
  - 日志、诊断、备份、恢复动作聚合服务
- `ui/src/app/services/runtimeMaintenance.ts`
  - 前端日志/诊断/备份调用封装

### Modify
- `ui/desktop/services/hermes-cli.mjs`
  - 扩展白名单命令与 `HERMES_HOME` env 支持
- `ui/desktop/main.mjs`
  - 注册 runtime maintenance IPC
- `ui/desktop/preload.mjs`
  - 暴露 runtime maintenance API
- `ui/src/hermes-desktop.d.ts`
  - 补日志/诊断/备份 DTO 与动作类型
- `ui/src/app/pages/instance/Logs.tsx`
  - 从真实日志与诊断 DTO 渲染
- `ui/src/app/pages/instance/Backups.tsx`
  - 从真实备份 DTO 渲染，接入创建/恢复/删除

---

## Validation Strategy

### 服务级验证
- 本地实例缺失时返回结构化错误，不伪造日志或备份
- 日志读取支持 `agent/errors/gateway` 三类
- 远程实例 SSH 私钥缺失时，日志/诊断/备份返回真实 SSH 错误
- 本地备份能真实创建 zip 到 `workspaceDir/backups`
- 远程备份能真实创建 artifact 或返回清晰错误
- 恢复动作失败时保留原备份文件并返回结构化错误

### 构建验证
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

### 桌面态回归
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- 验收路径：
  - `/instance/local-studio/logs`
  - `/instance/local-studio/backups`
  - `/instance/remote-gateway/logs`
  - `/instance/remote-gateway/backups`

### 诚实交互约束
- 没有实例时显示“实例不存在/未初始化”，不再渲染静态日志正文
- 不能恢复时按钮 disabled 或返回真实错误
- “危险维护区”保留只读或 disabled，不顺手伪装完整销毁流程

---

### Task 1: 建立运行与恢复桌面服务

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/instance-runtime.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/hermes-cli.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/hermes-desktop.d.ts`

- [ ] **Step 1: 扩展 Hermes CLI 调用白名单与 env override**
  - `logs`
  - `backup`
  - `import`
  - `status --deep`
- [ ] **Step 2: 实现实例日志读取 DTO**
  - agent / errors / gateway
  - lines / level / component / since
- [ ] **Step 3: 实现实例诊断 DTO**
  - status / doctor / docker / gateway / ssh 摘要
- [ ] **Step 4: 实现实例备份 DTO 与动作**
  - list
  - create
  - restore
  - delete
- [ ] **Step 5: 提交本任务**
  - 提交信息：`实现运行与恢复桌面服务`

---

### Task 2: 接入 Logs 页面真实状态

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/runtimeMaintenance.ts`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Logs.tsx`

- [ ] **Step 1: tabs 对应真实日志类别**
- [ ] **Step 2: 搜索/过滤在前端基于真实日志数据生效**
- [ ] **Step 3: 诊断侧栏读取真实诊断 DTO**
- [ ] **Step 4: 暂停/继续使用定时刷新实现，不做假流式**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`接入实例日志页真实状态`

---

### Task 3: 接入 Backups 页面真实状态与恢复动作

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Backups.tsx`

- [ ] **Step 1: 渲染真实备份列表与摘要**
- [ ] **Step 2: 创建快照按钮走真实备份创建**
- [ ] **Step 3: 恢复按钮走真实恢复动作**
- [ ] **Step 4: 删除备份接真实删除动作，危险维护区保留 disabled**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`接入实例备份页真实状态与恢复动作`

---

### Task 4: 第五阶段整体验收与回归

- [ ] **Step 1: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`
- [ ] **Step 2: 桌面开发链回归**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- [ ] **Step 3: 路由与交互回归**
  - `/instance/local-studio/logs`
  - `/instance/local-studio/backups`
  - `/instance/remote-gateway/logs`
  - `/instance/remote-gateway/backups`
- [ ] **Step 4: 修复回归问题并再次验证**
- [ ] **Step 5: 提交本任务**
  - 提交信息：`完成运行与恢复阶段验收`
