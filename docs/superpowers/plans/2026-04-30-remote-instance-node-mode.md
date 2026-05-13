# 远程实例节点化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将远程实例从“会话/工作区型入口”重构为“部署与接入节点”，保留本地实例现有创作工作区体验。

**Architecture:** 在路由与导航层按实例类型分流：本地实例继续使用会话型导航，远程实例切换到节点型导航。通过新增远程专属页面（环境检查、部署管理、诊断）与旧页面软跳转，避免一次性删除底层 workspace/profile/provider 逻辑，同时明确远程能力边界。

**Tech Stack:** React, React Router, TypeScript/TSX, existing Hermes desktop bridge services, existing instance runtime services.

---

## File Structure

### Existing files to modify
- `ui/src/app/layout/RootLayout.tsx`
  - 负责左侧导航生成；需要基于 `activeInstance.type` 生成本地/远程两套导航。
- `ui/src/app/routes.tsx`
  - 负责实例页路由注册；需要新增远程专属子页面与旧入口重定向。
- `ui/src/app/pages/instance/Overview.tsx`
  - 负责概况页；需要为远程实例弱化“会话/工作区”CTA，改为节点操作。
- `ui/src/app/services/runtime.ts`
  - 负责实例概览数据映射；需要修正文案与远程端口描述，避免继续强调远程工作区。
- `ui/src/app/pages/instance/Chat.tsx`
  - 远程场景需要重定向而不是继续渲染会话 UI。
- `ui/src/app/pages/instance/Profiles.tsx`
  - 远程场景需要重定向或明确降级。
- `ui/src/app/pages/instance/Backups.tsx`
  - 远程场景从主导航移除；页面入口访问时需要安全跳转。

### New files to create
- `ui/src/app/pages/instance/Environment.tsx`
  - 远程节点环境检查页。
- `ui/src/app/pages/instance/Deployment.tsx`
  - 远程节点部署管理页。
- `ui/src/app/pages/instance/Diagnostics.tsx`
  - 远程节点诊断页。
- `ui/tests/remote-instance-node-navigation.test.mjs`
  - 校验 RootLayout / routes / 远程页面重定向的静态回归测试。

### Optional helper file if needed during implementation
- `ui/src/app/pages/instance/remote-node.tsx`
  - 若实现中发现远程实例判断、提示条、节点级 CTA 在多个页面重复，可抽成小 helper；无必要则不创建。

---

### Task 1: 为远程实例建立节点型导航与路由骨架

**Files:**
- Modify: `ui/src/app/layout/RootLayout.tsx`
- Modify: `ui/src/app/routes.tsx`
- Test: `ui/tests/remote-instance-node-navigation.test.mjs`

- [ ] **Step 1: 写静态失败测试，锁定远程导航与新路由目标**

```js
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const rootLayout = fs.readFileSync(path.join(process.cwd(), "ui/src/app/layout/RootLayout.tsx"), "utf8");
const routes = fs.readFileSync(path.join(process.cwd(), "ui/src/app/routes.tsx"), "utf8");

assert.match(rootLayout, /environment/i);
assert.match(rootLayout, /deployment/i);
assert.match(rootLayout, /diagnostics/i);
assert.doesNotMatch(rootLayout, /remote.*会话/s);
assert.match(routes, /path: "environment"/);
assert.match(routes, /path: "deployment"/);
assert.match(routes, /path: "diagnostics"/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: FAIL，提示缺少 environment/deployment/diagnostics 路由或导航项。

- [ ] **Step 3: 在 `RootLayout.tsx` 引入按实例类型动态分流的导航配置**

```tsx
const localWorkspaceNav = activeInstance
  ? [
      { to: `/instance/${activeInstance.id}`, icon: Activity, label: "概览", exact: true },
      { to: `/instance/${activeInstance.id}/chat`, icon: MessageSquare, label: "会话" },
      { to: `/instance/${activeInstance.id}/profiles`, icon: Briefcase, label: "档案" },
      { to: `/instance/${activeInstance.id}/providers`, icon: Server, label: "提供商" },
      { to: `/instance/${activeInstance.id}/integrations`, icon: Puzzle, label: "集成" },
      { to: `/instance/${activeInstance.id}/logs`, icon: Activity, label: "日志" },
      { to: `/instance/${activeInstance.id}/backups`, icon: Shield, label: "备份" },
    ]
  : [];

const remoteWorkspaceNav = activeInstance
  ? [
      { to: `/instance/${activeInstance.id}`, icon: Activity, label: "概况", exact: true },
      { to: `/instance/${activeInstance.id}/environment`, icon: Shield, label: "环境检查" },
      { to: `/instance/${activeInstance.id}/deployment`, icon: Settings, label: "部署管理" },
      { to: `/instance/${activeInstance.id}/providers`, icon: Server, label: "AI 提供商" },
      { to: `/instance/${activeInstance.id}/integrations`, icon: Puzzle, label: "消息平台" },
      { to: `/instance/${activeInstance.id}/logs`, icon: Activity, label: "日志" },
      { to: `/instance/${activeInstance.id}/diagnostics`, icon: Shield, label: "诊断" },
    ]
  : [];

const workspaceNav = activeInstance
  ? activeInstance.type === "remote"
    ? remoteWorkspaceNav
    : localWorkspaceNav
  : [];
```

- [ ] **Step 4: 在 `routes.tsx` 注册远程页面路由骨架**

```tsx
import { Environment } from "./pages/instance/Environment";
import { Deployment } from "./pages/instance/Deployment";
import { Diagnostics } from "./pages/instance/Diagnostics";

{
  path: "instance/:id",
  children: [
    { index: true, Component: Overview },
    { path: "chat", Component: Chat },
    { path: "profiles", Component: Profiles },
    { path: "providers", Component: Providers },
    { path: "integrations", Component: Integrations },
    { path: "logs", Component: Logs },
    { path: "backups", Component: Backups },
    { path: "environment", Component: Environment },
    { path: "deployment", Component: Deployment },
    { path: "diagnostics", Component: Diagnostics },
  ],
}
```

- [ ] **Step 5: 重跑静态测试确认通过**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add ui/src/app/layout/RootLayout.tsx ui/src/app/routes.tsx ui/tests/remote-instance-node-navigation.test.mjs
git commit -m "重构远程实例导航与路由骨架"
```

---

### Task 2: 新增远程节点专属页面骨架

**Files:**
- Create: `ui/src/app/pages/instance/Environment.tsx`
- Create: `ui/src/app/pages/instance/Deployment.tsx`
- Create: `ui/src/app/pages/instance/Diagnostics.tsx`
- Modify: `ui/src/app/services/runtime.ts`

- [ ] **Step 1: 为新页面写最小渲染测试断言（可继续放入静态测试文件）**

```js
const environmentPage = fs.readFileSync(path.join(process.cwd(), "ui/src/app/pages/instance/Environment.tsx"), "utf8");
const deploymentPage = fs.readFileSync(path.join(process.cwd(), "ui/src/app/pages/instance/Deployment.tsx"), "utf8");
const diagnosticsPage = fs.readFileSync(path.join(process.cwd(), "ui/src/app/pages/instance/Diagnostics.tsx"), "utf8");

assert.match(environmentPage, /环境检查/);
assert.match(deploymentPage, /部署管理/);
assert.match(diagnosticsPage, /诊断/);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: FAIL，提示新页面文件不存在。

- [ ] **Step 3: 创建 `Environment.tsx`，以只读诊断卡片为主**

```tsx
export function Environment() {
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <PageHeader title="环境检查" description="读取 SSH、目录、Docker、端口与 Hermes CLI 的真实状态。" />
      <Card className="mt-6 p-6">环境检查页面骨架</Card>
    </div>
  );
}
```

- [ ] **Step 4: 创建 `Deployment.tsx`，承载部署元信息与运维动作占位**

```tsx
export function Deployment() {
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <PageHeader title="部署管理" description="查看容器、镜像、端口与工作目录，并执行重建或重启。" />
      <Card className="mt-6 p-6">部署管理页面骨架</Card>
    </div>
  );
}
```

- [ ] **Step 5: 创建 `Diagnostics.tsx`，承载摘要级错误归因**

```tsx
export function Diagnostics() {
  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <PageHeader title="诊断" description="集中展示节点健康状态、最近错误与建议动作。" />
      <Card className="mt-6 p-6">诊断页面骨架</Card>
    </div>
  );
}
```

- [ ] **Step 6: 在 `runtime.ts` 修正文案，避免继续把远程实例写成工作区型入口**

```ts
const runtimeSummary = instance.type === "remote"
  ? `远程节点运行中，可通过 ${instance.endpoint} 管理映射端口 ${instance.publishedPort ?? 8642}。`
  : existingLocalSummary;
```

- [ ] **Step 7: 重跑静态测试确认通过**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add ui/src/app/pages/instance/Environment.tsx ui/src/app/pages/instance/Deployment.tsx ui/src/app/pages/instance/Diagnostics.tsx ui/src/app/services/runtime.ts ui/tests/remote-instance-node-navigation.test.mjs
git commit -m "新增远程节点专属页面骨架"
```

---

### Task 3: 为远程旧入口添加软跳转与提示

**Files:**
- Modify: `ui/src/app/pages/instance/Chat.tsx`
- Modify: `ui/src/app/pages/instance/Profiles.tsx`
- Modify: `ui/src/app/pages/instance/Backups.tsx`
- Test: `ui/tests/remote-instance-node-navigation.test.mjs`

- [ ] **Step 1: 添加失败断言，要求远程旧页面包含 Navigate/redirect 逻辑**

```js
const chatPage = fs.readFileSync(path.join(process.cwd(), "ui/src/app/pages/instance/Chat.tsx"), "utf8");
const profilesPage = fs.readFileSync(path.join(process.cwd(), "ui/src/app/pages/instance/Profiles.tsx"), "utf8");
const backupsPage = fs.readFileSync(path.join(process.cwd(), "ui/src/app/pages/instance/Backups.tsx"), "utf8");

assert.match(chatPage, /Navigate|navigate\(/);
assert.match(profilesPage, /Navigate|navigate\(/);
assert.match(backupsPage, /Navigate|navigate\(/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: FAIL，提示旧页面尚未处理远程软跳转。

- [ ] **Step 3: 在 `Chat.tsx` 顶部添加远程场景早返回**

```tsx
if (instance?.type === "remote") {
  return (
    <Navigate
      to={`/instance/${instance.id}/deployment`}
      replace
      state={{ banner: "远程实例当前定位为部署节点，不提供持续会话入口。" }}
    />
  );
}
```

- [ ] **Step 4: 在 `Profiles.tsx` 为远程场景跳转到 providers**

```tsx
if (instance?.type === "remote") {
  return (
    <Navigate
      to={`/instance/${instance.id}/providers`}
      replace
      state={{ banner: "远程实例默认不展示档案入口，请在 AI 提供商与消息平台页继续配置节点。" }}
    />
  );
}
```

- [ ] **Step 5: 在 `Backups.tsx` 为远程场景跳回概况或 diagnostics**

```tsx
if (instance?.type === "remote") {
  return (
    <Navigate
      to={`/instance/${instance.id}/diagnostics`}
      replace
      state={{ banner: "远程实例当前不在主流程中提供备份页，请在诊断与部署管理页完成节点维护。" }}
    />
  );
}
```

- [ ] **Step 6: 重跑测试确认通过**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add ui/src/app/pages/instance/Chat.tsx ui/src/app/pages/instance/Profiles.tsx ui/src/app/pages/instance/Backups.tsx ui/tests/remote-instance-node-navigation.test.mjs
git commit -m "为远程旧入口增加节点化软跳转"
```

---

### Task 4: 调整远程概况页 CTA 与信息展示

**Files:**
- Modify: `ui/src/app/pages/instance/Overview.tsx`
- Modify: `ui/src/app/services/runtime.ts`

- [ ] **Step 1: 写最小失败断言，要求远程概况页不再渲染“打开会话”主按钮**

```js
const overviewPage = fs.readFileSync(path.join(process.cwd(), "ui/src/app/pages/instance/Overview.tsx"), "utf8");
assert.doesNotMatch(overviewPage, /远程.*打开会话/s);
assert.match(overviewPage, /部署管理|环境检查|诊断/);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: FAIL，提示远程概况页 CTA 仍偏会话型。

- [ ] **Step 3: 在 `Overview.tsx` 基于实例类型切分 CTA**

```tsx
const primaryAction = instance?.type === "remote"
  ? { label: "部署管理", onClick: () => navigate(`/instance/${instance.id}/deployment`) }
  : { label: "打开会话", onClick: () => navigate(`/instance/${instance.id}/chat`) };

const secondaryAction = instance?.type === "remote"
  ? { label: "环境检查", onClick: () => navigate(`/instance/${instance.id}/environment`) }
  : { label: "提供商", onClick: () => navigate(`/instance/${instance.id}/providers`) };
```

- [ ] **Step 4: 将远程统计文案改成节点化语言**

```tsx
{
  title: "节点状态",
  value: getStatusLabel(instance),
  detail: instance.diagnostics?.detail ?? instance.summary,
}
```

- [ ] **Step 5: 为远程概况增加部署元信息卡片**

```tsx
const remoteDetailRows = [
  { label: "容器名称", value: instance.containerName ?? "尚未创建" },
  { label: "映射端口", value: String(instance.publishedPort ?? "未分配") },
  { label: "远程目录", value: instance.workspaceDir ?? "未检测到" },
  { label: "最近错误", value: instance.lastError ?? "无" },
];
```

- [ ] **Step 6: 运行测试与人工 smoke check**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: PASS

Run: `cd ui && npm run build`
Expected: build succeeds

- [ ] **Step 7: 提交**

```bash
git add ui/src/app/pages/instance/Overview.tsx ui/src/app/services/runtime.ts ui/tests/remote-instance-node-navigation.test.mjs
git commit -m "调整远程概况页为节点化操作入口"
```

---

### Task 5: 填充远程环境检查 / 部署管理 / 诊断页的真实数据

**Files:**
- Modify: `ui/src/app/pages/instance/Environment.tsx`
- Modify: `ui/src/app/pages/instance/Deployment.tsx`
- Modify: `ui/src/app/pages/instance/Diagnostics.tsx`
- Modify: `ui/src/app/services/runtime.ts`
- Test: `ui/tests/remote-instance-node-navigation.test.mjs`

- [ ] **Step 1: 写失败断言，要求新页面包含关键字段**

```js
assert.match(environmentPage, /SSH|Docker|端口|工作目录/);
assert.match(deploymentPage, /容器|镜像|端口|重建|重启/);
assert.match(diagnosticsPage, /最近错误|建议动作|健康/);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: FAIL，提示页面仍为空壳。

- [ ] **Step 3: 在 `Environment.tsx` 渲染运行时检查结果卡片**

```tsx
const checks = [
  { label: "SSH", value: instance.diagnostics?.ssh?.detail ?? instance.endpoint },
  { label: "Docker", value: instance.diagnostics?.docker?.detail ?? "未检测" },
  { label: "工作目录", value: instance.workspaceDir ?? "未检测" },
  { label: "端口", value: String(instance.publishedPort ?? "未分配") },
];
```

- [ ] **Step 4: 在 `Deployment.tsx` 渲染部署元信息与运维按钮**

```tsx
const metadata = [
  { label: "容器名称", value: instance.containerName ?? "尚未创建" },
  { label: "镜像", value: instance.image ?? "未记录" },
  { label: "映射端口", value: String(instance.publishedPort ?? "未分配") },
  { label: "工作目录", value: instance.workspaceDir ?? "未检测" },
];
```

- [ ] **Step 5: 在 `Diagnostics.tsx` 聚合错误归因与建议动作**

```tsx
const diagnosis = {
  summary: instance.lastError ?? instance.summary ?? "当前未发现明确错误。",
  suggestion: instance.lastError
    ? "请优先检查 SSH、Docker、端口占用与 Gateway 健康状态。"
    : "节点运行正常，可继续配置提供商与消息平台。",
};
```

- [ ] **Step 6: 运行构建与静态回归**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs && cd ui && npm run build`
Expected: all pass

- [ ] **Step 7: 提交**

```bash
git add ui/src/app/pages/instance/Environment.tsx ui/src/app/pages/instance/Deployment.tsx ui/src/app/pages/instance/Diagnostics.tsx ui/src/app/services/runtime.ts ui/tests/remote-instance-node-navigation.test.mjs
git commit -m "填充远程节点页面与诊断信息"
```

---

### Task 6: 桌面端验收与回归整理

**Files:**
- Modify if needed: `ui/src/app/layout/RootLayout.tsx`
- Modify if needed: `ui/src/app/pages/instance/*.tsx`
- Test: `ui/tests/remote-instance-node-navigation.test.mjs`

- [ ] **Step 1: 运行静态回归与构建**

Run: `node ui/tests/remote-instance-node-navigation.test.mjs`
Expected: PASS

Run: `cd ui && npm run build`
Expected: PASS

- [ ] **Step 2: 启动桌面端进行手工验收**

Run: `cd ui && npm run desktop:dev`
Expected: Vite at `http://127.0.0.1:4174/` and Electron launched

- [ ] **Step 3: 验收本地实例导航未受影响**

Checklist:
- 本地实例仍显示 会话 / 档案 / 提供商 / 集成 / 日志 / 备份
- 本地概况页 CTA 仍可进入会话

- [ ] **Step 4: 验收远程实例导航完成节点化**

Checklist:
- 远程实例显示 概况 / 环境检查 / 部署管理 / AI 提供商 / 消息平台 / 日志 / 诊断
- 不显示 会话 / 档案 / 备份
- 远程概况页主按钮为部署管理/环境检查类动作

- [ ] **Step 5: 验收旧入口重定向**

Checklist:
- 打开 `/instance/<remote-id>/chat` 自动跳到部署管理
- 打开 `/instance/<remote-id>/profiles` 自动跳到 providers
- 打开 `/instance/<remote-id>/backups` 自动跳到 diagnostics 或概况

- [ ] **Step 6: 最终提交**

```bash
git add ui/src/app/layout/RootLayout.tsx ui/src/app/routes.tsx ui/src/app/pages/instance ui/src/app/services/runtime.ts ui/tests/remote-instance-node-navigation.test.mjs
git commit -m "完成远程实例节点化重构与验收"
```

---

## Self-Review

### Spec coverage
- 实例定位拆分：已覆盖（Task 1/4）
- 远程节点型导航：已覆盖（Task 1）
- 新页面：已覆盖（Task 2/5）
- 旧入口软跳转：已覆盖（Task 3）
- 概况页 CTA 与文案：已覆盖（Task 4）
- 验收与桌面端回归：已覆盖（Task 6）

### Placeholder scan
- 无 TBD / TODO / “后续补充” 式步骤
- 每个任务都给出了明确文件与命令
- 测试命令与预期结果已填写

### Type consistency
- 远程页面统一命名：`Environment` / `Deployment` / `Diagnostics`
- 远程实例统一定位用语：节点 / 部署 / 接入 / 诊断
- 旧页面软跳转目标保持一致：chat→deployment，profiles→providers，backups→diagnostics/概况

