# Hermes Console 第二阶段功能对接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the current session. 本阶段延续已批准的功能对接设计文档，只做 Hermes 官方对象的**只读真实同步**，不新增写操作与伪状态。

**Goal:** 将实例内的 `档案 / 提供商 / 集成` 从静态 mock 数据切到真实 Hermes 配置状态：读取每个实例的 `HERMES_HOME`、`config.yaml`、`.env`、`auth.json`、`profiles/*`，并把真实摘要回流到 `Profiles / Providers / Integrations` 页面。

**Architecture:** 继续沿用双真相源架构。Console 注册表只负责找到实例；Hermes 官方对象状态全部从实例的 `HERMES_HOME` 读取。第二阶段只做**只读同步**：不在页面内执行 profile/provider/gateway 的修改，不扩展新的业务后端。

**Tech Stack:** React 18、TypeScript、Electron、Node.js ESM、现有实例注册表与运行态服务、Hermes 官方目录结构（`config.yaml` / `.env` / `auth.json` / `profiles/`）。

---

## File Map

### Create

- `ui/desktop/services/hermes-official-state.mjs`
  - 读取实例内 Hermes 官方对象状态并聚合为桌面 DTO
- `ui/src/app/services/officialState.ts`
  - 前端只读 Hermes 官方状态适配层

### Modify

- `ui/desktop/main.mjs`
  - 注册 `getInstanceOfficialState` IPC handler
- `ui/desktop/preload.mjs`
  - 暴露实例官方状态读取 API
- `ui/src/hermes-desktop.d.ts`
  - 补充官方对象 DTO 类型
- `ui/src/app/pages/instance/Profiles.tsx`
  - 改为读取实例真实 profile 摘要
- `ui/src/app/pages/instance/Providers.tsx`
  - 改为读取实例真实 provider/model 摘要
- `ui/src/app/pages/instance/Integrations.tsx`
  - 改为读取实例真实 gateway / API server / integration 摘要

### Reuse

- `ui/desktop/services/instance-registry.mjs`
  - 用于定位实例与 `HERMES_HOME`
- `ui/src/app/data/hermesOfficial.ts`
  - 仅保留为无桌面 bridge 时的静态 fallback，不再作为桌面主真相源

---

## Validation Strategy

### 服务级验证
- 构造临时 `HERMES_HOME`：
  - `config.yaml`
  - `.env`
  - `auth.json`
  - `profiles/<name>/config.yaml`
  - `profiles/<name>/.env`
- 通过 `hermes-official-state.mjs` 直接读取并验证：
  - 默认档案与命名档案都能识别
  - provider 状态能从 `config.yaml / .env / auth.json` 推断
  - gateway / API server / ACP 等摘要能从 `config.yaml / .env` 推断

### 构建验证
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

### 桌面态回归
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- 路由回归：
  - `/instance/<id>/profiles`
  - `/instance/<id>/providers`
  - `/instance/<id>/integrations`

### 诚实交互约束
- 页面只展示已接线的只读摘要
- 原先的编辑、测试连接、导入/导出等强交互仍保持 disabled
- 不因缺少真实配置而回退成“看起来已配置”的假状态

---

## Shared Conventions

### Hermes 官方状态 DTO 约定
统一返回：
- `instance`
- `profiles[]`
- `providers[]`
- `integrations[]`
- `sources`

### 配置解析约定
- `config.yaml` 只解析本阶段所需的稳定字段：
  - `model.provider`
  - `model.default` / `model.model`
  - `model.base_url`
  - `plugins.enabled`
- `.env` 只解析键值，不在前端暴露明文 secret
- `auth.json` 仅用于判断 OAuth provider 是否已存在凭据

### 页面行为约定
- 如果桌面 bridge 不可用：允许继续使用静态 fallback
- 如果桌面 bridge 可用但实例不存在：显示实例缺失/未初始化空态
- 如果实例存在但未配置：显示“待配置 / 未完成”，不得显示成功态

---

### Task 1: 实现实例官方状态读取服务

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/hermes-official-state.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/hermes-desktop.d.ts`

- [ ] **Step 1: 从实例注册表定位 `HERMES_HOME`**
  - 输入 `instanceId`
  - 读取实例记录并确认目录存在

- [ ] **Step 2: 实现最小配置解析器**
  - 解析 `.env`
  - 解析本阶段需要的 `config.yaml` 字段
  - 读取 `auth.json`

- [ ] **Step 3: 聚合 profile 摘要**
  - 默认 profile = 实例根 `HERMES_HOME`
  - 命名 profile = `profiles/*`
  - 读取 provider / model / session 数量 / 最近活动 / gateway 状态

- [ ] **Step 4: 聚合 provider 摘要**
  - 基于当前配置、`.env` 与 `auth.json` 识别已配置 provider
  - 生成 provider 类型、认证摘要、默认模型、状态

- [ ] **Step 5: 聚合 integration 摘要**
  - 识别消息平台、API Server、ACP、Plugins 等核心入口
  - 输出只读字段摘要与状态

- [ ] **Step 6: 暴露桌面 bridge / IPC**
  - `getInstanceOfficialState(instanceId)`

- [ ] **Step 7: 服务级自测**
  - 用临时实例目录验证读取结果

- [ ] **Step 8: 提交本任务**
  - 提交信息：`实现实例官方状态读取服务`

---

### Task 2: 接入档案页真实状态

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/officialState.ts`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Profiles.tsx`

- [ ] **Step 1: 封装前端官方状态读取服务**
  - 统一调用 `getInstanceOfficialState`
  - 允许无 bridge 时回退静态数据

- [ ] **Step 2: 将 Profiles 切到真实 instanceId**
  - 从路由参数读取实例 id
  - 读取真实 profile 摘要

- [ ] **Step 3: 收口空态 / 缺失态 / 加载态**
  - 实例不存在
  - profile 为空
  - bridge 不可用 fallback

- [ ] **Step 4: 提交本任务**
  - 提交信息：`接入档案页真实状态同步`

---

### Task 3: 接入提供商页与集成页真实状态

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Providers.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Integrations.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/officialState.ts`

- [ ] **Step 1: 将 Providers 切到真实 provider/model 摘要**
  - 真实分组
  - 真实状态
  - 真实字段摘要

- [ ] **Step 2: 将 Integrations 切到真实 gateway / API server / ACP 摘要**
  - 真实分组
  - 真实健康状态
  - 真实字段摘要

- [ ] **Step 3: 收口异常与空态**
  - 实例缺失
  - 未配置
  - bridge 不可用 fallback

- [ ] **Step 4: 提交本任务**
  - 提交信息：`接入提供商页与集成页真实状态同步`

---

### Task 4: 第二阶段验收与桌面回归

**Files:**
- Verify only (unless regression fixes are required)

- [ ] **Step 1: 运行构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 2: 运行桌面开发链回归**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`

- [ ] **Step 3: 验收核心页面**
  - `/instance/<id>/profiles`
  - `/instance/<id>/providers`
  - `/instance/<id>/integrations`

- [ ] **Step 4: 如有必要，修复回归问题并再次验证**

- [ ] **Step 5: 提交本任务**
  - 提交信息：`完成第二阶段官方对象只读同步验收`
