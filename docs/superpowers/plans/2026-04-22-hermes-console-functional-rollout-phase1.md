# Hermes Console 第一阶段功能对接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有 UI/UX 基线的前提下，完成 Hermes Console 第一阶段真实功能对接：打通“本地 Docker 实例创建 → 注册到 Console → 启动 / 停止 / 状态读取 → Dashboard / Create / Overview 真状态回流”的闭环。

**Architecture:** 采用“双真相源”架构：Hermes 官方 CLI / `HERMES_HOME` / 配置目录负责单实例内部状态，Console 本地实例注册表负责多实例目录索引。第一阶段只做本地 Docker 与已有 Hermes CLI，不做远程 SSH、Native、本地 CLI 安装升级、provider/profile/gateway 的真实写操作。

**Tech Stack:** React 18、React Router 7、TypeScript、Vite、Electron、Node.js ESM、Hermes CLI (`/Users/zhachenhao/.local/bin/hermes`)、本机 Docker 命令、现有 `preload.mjs / main.mjs / CreateInstance / Dashboard / Overview`。

---

## File Map

### Create

- `ui/desktop/services/environment.mjs`
  - 本机路径与环境探测服务
- `ui/desktop/services/hermes-cli.mjs`
  - Hermes CLI 受控调用封装
- `ui/desktop/services/docker-runtime.mjs`
  - Docker 受控调用封装与基础状态探测
- `ui/desktop/services/instance-registry.mjs`
  - Console 实例注册表读写
- `ui/desktop/services/local-instance.mjs`
  - 本地 Docker 实例创建、启动、停止
- `ui/desktop/services/instance-state.mjs`
  - 注册表 + CLI + Docker 状态聚合
- `ui/src/app/services/system.ts`
  - 前端系统能力调用封装
- `ui/src/app/services/instances.ts`
  - 前端实例查询与实例动作调用封装
- `ui/src/app/services/runtime.ts`
  - 前端实例状态刷新封装

### Modify

- `ui/desktop/preload.mjs`
  - 暴露结构化桌面 API 给 renderer
- `ui/desktop/main.mjs`
  - 注册 IPC handler，连接 preload 与 desktop services
- `ui/src/hermes-desktop.d.ts`
  - 补桌面能力类型定义
- `ui/src/app/data/console.ts`
  - 从“主真相源 mock”降级为临时 fallback / 静态辅助数据，避免继续承担核心状态职责
- `ui/src/app/layout/RootLayout.tsx`
  - 当前实例信息从真实实例服务读取
- `ui/src/app/pages/Dashboard.tsx`
  - 实例列表、状态摘要、最近实例动作接真实状态
- `ui/src/app/pages/CreateInstance.tsx`
  - Step 2 环境检查、Step 5 创建/部署与成功态接真实能力
- `ui/src/app/pages/instance/Overview.tsx`
  - 实例概览改为真实状态摘要

### Optional Modify

- `ui/src/app/context/AppContext.tsx`
  - 如当前状态结构阻碍真实接入，则最小重构，只保留全局语言/主题/实例选择，不再自己模拟实例加载
- `ui/src/app/routes.tsx`
  - 仅在需要引入新的 provider/store 包装层时微调，不改变现有路由结构

### Verify

- `ui/package.json`
  - 使用既有脚本 `npm run build` / `npm run desktop:dev`

---

## Validation Strategy

第一阶段没有现成自动化测试基建；以 **命令级验证 + 构建通过 + 桌面态回归 + 路由级验收** 作为门槛。

### 命令级验证
- Hermes CLI 可调用：`/Users/zhachenhao/.local/bin/hermes --version`
- Docker 可调用：`docker version` / `docker ps`（若命令不存在或 daemon 未启动，必须回到 UI 错误态）

### 构建验证
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

### 桌面态回归
- `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`
- Electron 主窗口能正常启动，且不依赖 mock 才能展示实例列表

### 关键验收路径
- `/create?type=local`
- `/`
- `/instance/<id>`

### 第一阶段最终用户闭环
1. 打开桌面端
2. 进入“创建实例”
3. 选择本地实例 + Docker
4. 创建实例成功
5. Dashboard 出现真实实例
6. 进入实例概览页看到真实状态
7. 停止实例
8. 状态变化
9. 再启动实例
10. 状态恢复
11. 退出并重开客户端，实例仍存在

---

## Shared Conventions

### 桌面 API 返回约定
所有桌面 bridge 调用必须返回结构化对象，而不是直接把 stdout 丢给前端。

建议统一：

```ts
interface DesktopResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    detail?: string;
    recoverable: boolean;
  };
}
```

### 状态模型约定
内部统一状态：
- `creating`
- `running`
- `stopped`
- `warning`
- `failed`
- `unknown`

映射到现有 UI：
- `running -> 正常`
- `warning -> 警告`
- `stopped / failed / unknown -> 离线或失败态`

### 路径约定
- Console 注册表放在 Electron `app.getPath('userData')` 下
- 本地实例根目录默认放在 `~/HermesOS/instances`
- 每个实例目录结构：
  - `<instance-root>/home` 作为独立 `HERMES_HOME`
  - `<instance-root>/runtime` 放运行时辅助文件

### 诚实交互约定
- 第一阶段涉及到的按钮必须真实可用
- 暂未接线能力只能保留为只读/disabled，不得再制造强交互错觉

---

### Task 1: 建立桌面基础能力桥

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/environment.mjs`
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/hermes-cli.mjs`
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/docker-runtime.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/hermes-desktop.d.ts`

- [ ] **Step 1: 抽出桌面路径与环境服务**
  - 提供 userData 路径、默认 instances 根目录、homeDirectory、hostname、platform
  - 提供本机 Hermes CLI 可用性探测
  - 提供 Docker 命令可用性探测

- [ ] **Step 2: 抽出 Hermes CLI 受控调用封装**
  - 封装 `runHermesCommand(args: string[])`
  - 统一 stdout / stderr / exitCode / timeout
  - 约束第一阶段只允许调用白名单命令：`--version`、`status`、`doctor` 等只读命令

- [ ] **Step 3: 抽出 Docker 受控调用封装**
  - 封装 `runDockerCommand(args: string[])`
  - 统一错误结构，明确区分“docker 不存在”和“daemon 未启动”

- [ ] **Step 4: 在 preload 暴露最小桌面 API**
  - `getDesktopPaths()`
  - `inspectLocalEnvironment()`
  - 先不暴露创建/启停动作

- [ ] **Step 5: 在 main 层注册对应 handler**
  - preload 只透传，不写业务逻辑
  - main 负责串联 desktop services

- [ ] **Step 6: 更新前端类型定义**
  - 扩充 `window.hermesDesktop` 类型，去掉只有 platform/shell/homeDirectory/hostname 的简陋接口限制

- [ ] **Step 7: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 8: 提交本任务**
  - 提交信息：`建立桌面基础能力桥与受控命令调用`

---

### Task 2: 建立 Console 实例注册表

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/instance-registry.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/system.ts`
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/instances.ts`

- [ ] **Step 1: 定义注册表结构与文件位置**
  - JSON 结构含 `version` 和 `instances[]`
  - 文件放在 Electron `userData` 目录下

- [ ] **Step 2: 实现注册表读写与自恢复**
  - 缺失文件时自动初始化
  - JSON 损坏时备份原文件并回退为空结构
  - 提供 `list / get / upsert / remove` 基础操作

- [ ] **Step 3: 暴露实例注册表查询 API**
  - `listInstances()`
  - `getInstance(id)`

- [ ] **Step 4: 在前端增加实例服务封装**
  - 统一把 desktop result 转成 UI 可用对象
  - 保持与现有页面解耦

- [ ] **Step 5: 验证注册表持久化**
  - 至少用命令或临时调试验证：重启后仍能读到已写入的数据

- [ ] **Step 6: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 7: 提交本任务**
  - 提交信息：`建立 Console 实例注册表与前端实例服务`

---

### Task 3: 实现本地 Docker 实例创建闭环

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/local-instance.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/instances.ts`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/CreateInstance.tsx`

- [ ] **Step 1: 定义创建输入 DTO**
  - 只支持第一阶段必要字段：实例名称、本地、Docker、目标目录
  - provider/profile 字段先只作为实例元数据保留，不做深写 Hermes 内部配置

- [ ] **Step 2: 创建实例目录与独立 HERMES_HOME**
  - 默认根目录 `~/HermesOS/instances/<instance-id>`
  - 创建 `home/` 和 `runtime/`

- [ ] **Step 3: 写入注册表并返回创建结果**
  - 创建成功后立即注册实例
  - 返回 `id / name / hermesHome / endpoint / status`

- [ ] **Step 4: 接入 CreateInstance 成功链路**
  - Step 5 的“开始部署”不再只走假进度条
  - 成功页显示真实实例结果
  - 失败时回到结构化错误展示

- [ ] **Step 5: 明确第一阶段部署策略**
  - 如果当前环境无法真正启动容器，必须如实返回错误，不允许伪造成功
  - 如果能启动，则同步更新注册表状态

- [ ] **Step 6: 自验创建路径**
  - 创建后确认实例目录与 `home/` 实际存在

- [ ] **Step 7: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 8: 提交本任务**
  - 提交信息：`接通本地 Docker 实例创建与独立 Hermes Home`

---

### Task 4: 实现本地实例启停与状态探测

**Files:**
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/instance-state.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/services/local-instance.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/preload.mjs`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/desktop/main.mjs`
- Create: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/services/runtime.ts`

- [ ] **Step 1: 定义实例状态聚合逻辑**
  - 综合注册表、Docker 状态、Hermes CLI 只读状态
  - 输出统一内部状态：`creating / running / stopped / warning / failed / unknown`

- [ ] **Step 2: 增加实例动作 API**
  - `startInstance(id)`
  - `stopInstance(id)`
  - `getInstanceState(id)`

- [ ] **Step 3: 更新注册表状态快照**
  - 每次启停和状态探测后都刷新 `status / lastCheckedAt`

- [ ] **Step 4: 处理失败场景**
  - Docker 不存在
  - Docker daemon 未启动
  - Hermes CLI 不可用
  - 实例目录缺失

- [ ] **Step 5: 自验启停流程**
  - 至少通过命令或 UI 走通一次 stop → start → status refresh

- [ ] **Step 6: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 7: 提交本任务**
  - 提交信息：`接通本地实例启停控制与状态探测`

---

### Task 5: 将真实状态接入 Dashboard / Create / Overview

**Files:**
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/layout/RootLayout.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/Dashboard.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/CreateInstance.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/pages/instance/Overview.tsx`
- Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/context/AppContext.tsx`
- Optional Modify: `/Volumes/gm7000/开发代码/HermesOS/ui/src/app/data/console.ts`

- [ ] **Step 1: 替换 Dashboard 的实例来源**
  - 不再以 `console.ts` 作为主真相源
  - 支持真实实例列表与状态摘要

- [ ] **Step 2: 替换 RootLayout 当前实例来源**
  - 当前实例信息来自真实实例服务
  - 未选中实例时继续保持诚实交互

- [ ] **Step 3: 替换 Overview 的实例摘要来源**
  - 平台、运行方式、端点、状态由真实状态 DTO 驱动

- [ ] **Step 4: 替换 Create 流程中的环境和成功摘要**
  - 环境检查页读真实环境
  - 创建成功页读真实创建结果
  - 部署态按钮和错误态继续保持诚实交互

- [ ] **Step 5: 最小清理旧 mock 依赖**
  - 保留 `console.ts` 只作为 fallback 或开发辅助，不能再主导第一阶段关键页面

- [ ] **Step 6: 路由级验收**
  - `/create?type=local`
  - `/`
  - `/instance/<id>`

- [ ] **Step 7: 构建验证**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 8: 提交本任务**
  - 提交信息：`将本地实例真实状态接入概览与创建流程`

---

### Task 6: 第一阶段最终验收与桌面态回归

**Files:**
- Verify only

- [ ] **Step 1: 运行最终构建**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run build`

- [ ] **Step 2: 启动桌面开发态**
  - `cd /Volumes/gm7000/开发代码/HermesOS/ui && npm run desktop:dev`

- [ ] **Step 3: 完整跑通本地实例闭环**
  - 创建本地 Docker 实例
  - 在 Dashboard 看到实例
  - 进入实例概览页
  - 停止实例
  - 重新启动实例
  - 重启应用后仍能发现实例

- [ ] **Step 4: 检查诚实交互与错误回流**
  - 无新增假交互
  - Docker / CLI 失败时能回到 UI
  - 无静默失败

- [ ] **Step 5: 提交本任务**
  - 提交信息：`完成第一阶段本地实例闭环验收收口`

---

## Final Verification Checklist

- [ ] 桌面 bridge 已具备结构化系统能力调用
- [ ] Console 注册表已建立并可持久化
- [ ] 本地 Docker 实例可创建
- [ ] 每个实例拥有独立 `HERMES_HOME`
- [ ] 本地实例可启动 / 停止 / 探测状态
- [ ] Dashboard / Create / Overview 已接真实状态
- [ ] 关键错误会回到 UI，而不是静默失败
- [ ] 无新增假交互
- [ ] `npm run build` 通过
- [ ] Electron 开发态可正常启动并展示真实实例状态
